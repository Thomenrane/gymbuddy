#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 29 (progression automatique de charge) — exit != 0 sinon.
#
# 1. tsc + next build verts.
# 2. Module de progression PUR et testé (scripts/progression.test.mjs) : deux
#    séances d'affilée, haut de fourchette, RPE respecté, poids SIGNÉ (assisté :
#    -14 → -12), refus mémorisé, aucune cible inventée sans cible de départ.
# 3. Un seul écrivain de cible : le ✓ passe par `setExerciseTargetWith`, la
#    fonction que l'outil MCP appelle aussi, avec le client de SESSION (RLS) et
#    jamais la clé service_role. C'est l'amendement assumé au garde-fou du
#    Lot 14 — vérifié là-bas, et re-vérifié ici.
# 4. La proposition est CALCULÉE À LA LECTURE, jamais stockée : une proposition
#    en base deviendrait fausse dès la séance suivante enregistrée ou corrigée.
#    Seul le REFUS se mémorise, et il porte une VALEUR (pas un booléen), sinon
#    la progression serait tue pour toujours.
# 5. Migration non cassante : deux colonnes nullables + une fonction en security
#    invoker. Aucune table modifiée.
# 6. DOM (scripts/e2e/lot29-dom.mjs) : une séance ne suffit pas, deux
#    déclenchent, rien n'est écrit avant le tap, ✗ mémorise, ✓ pose la cible.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3229
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
warn() { echo "  ~~   $1"; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

MOD="src/lib/progression.mjs"
DECL="src/lib/progression.d.mts"
ACT="src/app/(tabs)/training/training-actions.ts"
SVC="src/lib/mcp/service.ts"
SRV="src/lib/training-server.ts"
EDT="src/components/training/session-editor.tsx"
MUSCU="src/app/(tabs)/training/muscu/page.tsx"
MIG="supabase/migrations/20260903000003_progression.sql"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  [ -n "${SERVER_PID:-}" ] && pkill -P "$SERVER_PID" 2>/dev/null || true
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== Lot 29 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Module de progression : pur et testé --"
if node scripts/progression.test.mjs; then
  ok "progression : streak, fourchette, RPE, signe, refus (détail ci-dessus)"
else
  ko "tests du module (scripts/progression.test.mjs)"
fi
grep -qE 'localStorage\.|from "(@supabase/|@/lib/supabase|next/|react"|react/)' "$MOD" \
  && ko "le module de progression touche au stockage/React (il doit rester pur)" \
  || ok "module pur"
# Les trois modules purs du lot précédent n'avaient pas de .d.mts : tsc acceptait
# des appels sans argument qui levaient à l'exécution, pendant que le garde-fou
# « tsc vert » passait.
[ -f "$DECL" ] && ok "déclarations .d.mts fournies" || ko "module .mjs sans .d.mts : tsc ne vérifie plus rien"

echo "-- 3. Un seul écrivain de cible --"
grep -q "export async function setExerciseTargetWith" "$SVC" \
  && ok "logique de pose de cible partagée (client en paramètre)" || ko "logique non partagée"
grep -q "setExerciseTargetWith(mcpDb(), input)" "$SVC" \
  && ok "le MCP passe son client service_role" || ko "entrée MCP non branchée sur la fonction partagée"
grep -q "setExerciseTargetWith(supabase," "$ACT" \
  && ok "l'app passe le client de SESSION (RLS appliquée)" || ko "l'app n'utilise pas la fonction partagée"
# Chercher « mcpDb » matcherait le commentaire qui explique pourquoi on ne
# l'utilise pas ici. On vise l'IMPORT, qu'aucun commentaire n'écrit.
grep -qE '^import .*from "@/lib/mcp/db"' "$ACT" \
  && ko "l'app importe le client service_role : RLS contournée depuis un bouton" \
  || ok "aucun client service_role côté app"

echo "-- 4. Proposition calculée, refus mémorisé par VALEUR --"
grep -q "suggestNextTarget({" "$MUSCU" && ok "proposition calculée à la lecture" || ko "proposition non calculée"
if grep -rn "suggested_weight\|suggestion_kg\|pending_suggestion" src/ supabase/ >/dev/null 2>&1; then
  ko "une proposition est STOCKÉE : elle deviendra fausse à la séance suivante"
else
  ok "aucune proposition stockée (seul le refus l'est)"
fi
grep -q "progression_declined_kg: input.to" "$ACT" \
  && ok "le refus mémorise la VALEUR refusée (pas un booléen définitif)" || ko "refus non chiffré : la progression serait tue pour toujours"
grep -q "progression_declined_kg: null" "$ACT" \
  && ok "accepter purge le refus précédent" || ko "un vieux refus bloquerait la proposition suivante"
grep -q "getRecentSessions" "$SRV" \
  && ok "les 2 dernières SÉANCES sont lues en base (pas tout l'historique)" || ko "lecture des séances absente"

echo "-- 5. Migration non cassante --"
grep -q "add column progression_step_kg numeric" "$MIG" && ok "pas de progression par exercice" || ko "colonne de pas absente"
grep -q "add column progression_declined_kg numeric" "$MIG" && ok "mémoire du refus" || ko "colonne de refus absente"
grep -qE "^security invoker" "$MIG" && ok "fonction en security invoker (RLS appliquée)" || ko "RLS contournable : refusé"
grep -qE "drop |alter table (workouts|workout_sets)" "$MIG" \
  && ko "la migration touche à autre chose que exercises" || ok "aucune table existante modifiée hors ajout de colonnes"

echo "-- 6. État de la base cible --"
RPC_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"exercise_ids":[],"sessions":2}' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/recent_sets_by_exercise")
if [ "$RPC_CODE" = "200" ]; then
  ok "recent_sets_by_exercise présente en base"
else
  warn "fonction ABSENTE (HTTP $RPC_CODE) — appliquer $MIG ; aucune proposition ne sera faite en attendant"
fi

echo "-- 7. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot29-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 8. DOM : pastille, ✓, ✗ --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot29-dom.mjs; then
  ok "DOM : proposition, refus mémorisé, acceptation (détail ci-dessus)"
else
  ko "DOM (scripts/e2e/lot29-dom.mjs)"
fi

echo "-- 9. Aucune donnée de test laissée en base --"
LEFT=$(curl -s --get "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/exercises" \
  --data-urlencode "select=name" --data-urlencode "name=eq.__PROGRESSION_EX__" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
[ "$LEFT" = "[]" ] && ok "exercice de test supprimé" || ko "exercice de test restant : $LEFT"
OLD=$(curl -s --get "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/workouts" \
  --data-urlencode "select=id" --data-urlencode "workout_date=lt.2000-01-01" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
[ "$OLD" = "[]" ] && ok "aucune séance de test (datée 1999) restante" || ko "séances de test restantes : $OLD"

if [ "$FAIL" -ne 0 ]; then echo "== Lot 29 : INCOMPLET =="; exit 1; fi
echo "== Lot 29 : OK =="
