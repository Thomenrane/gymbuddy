#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 25 (cohérence de lecture) — exit != 0 sinon.
# 1. tsc + next build verts.
# 2. Le RPE saisi (Lot 12) est enfin relu sur la fiche séance : une donnée
#    collectée et jamais affichée est une donnée qu'on arrête de saisir.
# 3. « Dernière fois » bornée en base : les deux chemins (RPC et repli
#    historique) produisent le MÊME résultat (scripts/last-sets.test.mjs),
#    donc l'ordre déploiement / migration est sans importance.
# 4. Migration non cassante : elle n'ajoute qu'une fonction, en security
#    invoker (RLS appliquée, aucune élévation de privilège).
# 5. DOM (scripts/e2e/lot25-dom.mjs) : le RPE saisi en séance se retrouve sur
#    la fiche, et le pré-remplissage « dernière fois » marche par le chemin
#    réellement actif sur la base cible. Nettoyage.
#
# La fonction SQL peut ne pas encore être appliquée : le contrat le DIT au lieu
# de le supposer, et l'app retombe sur l'ancienne requête sans rien casser.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3225
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
warn() { echo "  ~~   $1"; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

MIG="supabase/migrations/20260902000001_latest_sets_rpc.sql"
SRV="src/lib/training-server.ts"
FICHE="src/app/(tabs)/training/[id]/page.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  # `npx next start` n'est qu'un LANCEUR : tuer $SERVER_PID laisse vivre le
  # process `next-server` enfant, qui garde le port. Le contrat suivant croit
  # démarrer son serveur, échoue silencieusement à se lier, et teste en réalité
  # le build périmé du serveur resté là — deux faux échecs (Lots 18 et 19) avant
  # qu'on remonte jusqu'ici. On tue donc les enfants ET ce qui tient le port.
  [ -n "${SERVER_PID:-}" ] && pkill -P "$SERVER_PID" 2>/dev/null || true
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  fuser -k "$PORT/tcp" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 25 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. RPE relu sur la fiche séance --"
grep -q "RPE {s.rpe}" "$FICHE" && ok "RPE affiché par série" || ko "RPE toujours collecté sans être relu"
grep -q "s.rpe != null" "$FICHE" && ok "absent quand non saisi (jamais de « RPE null »)" || ko "affichage inconditionnel"

echo "-- 3. « Dernière fois » : les deux chemins concordent --"
if node scripts/last-sets.test.mjs; then
  ok "RPC et repli historique donnent le même résultat"
else
  ko "les deux chemins divergent (scripts/last-sets.test.mjs)"
fi
grep -q 'supabase.rpc("latest_sets_by_exercise"' "$SRV" && ok "lecture par RPC en premier" || ko "RPC non utilisée"
grep -q "if (!rpc.error)" "$SRV" && ok "repli si la migration n'est pas appliquée" || ko "aucun repli : déploiement risqué"

echo "-- 4. Migration non cassante --"
grep -q "create or replace function latest_sets_by_exercise" "$MIG" && ok "fonction créée" || ko "fonction absente"
# La clause SQL est en colonne 0 ; « security invoker » apparaît aussi dans
# l'en-tête de commentaire et dans le `comment on function`. Sans l'ancrage,
# passer la fonction en security definer laissait le contrat vert.
grep -qE "^security invoker" "$MIG" && ok "security invoker (RLS appliquée)" || ko "RLS contournable : refusé"
grep -qE "alter table|drop " "$MIG" && ko "la migration touche au schéma (elle doit seulement ajouter une fonction)" || ok "aucune table modifiée"
grep -q "distinct on (ws.exercise_id)" "$MIG" && ok "tri « dernier workout » fait en SQL" || ko "tri encore côté app"

echo "-- 5. État de la base cible --"
RPC_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"exercise_ids":[]}' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/latest_sets_by_exercise")
if [ "$RPC_CODE" = "200" ]; then
  ok "fonction présente en base : chemin rapide actif"
else
  warn "fonction ABSENTE en base (HTTP $RPC_CODE) — appliquer $MIG ; l'app tourne sur le repli en attendant"
fi

echo "-- 6. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot25-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 7. DOM : RPE sur la fiche, « dernière fois » toujours juste --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot25-dom.mjs; then
  ok "DOM : RPE relu, pré-remplissage intact (détail ci-dessus)"
else
  ko "DOM (scripts/e2e/lot25-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 25 : INCOMPLET =="; exit 1; fi
echo "== Lot 25 : OK =="
