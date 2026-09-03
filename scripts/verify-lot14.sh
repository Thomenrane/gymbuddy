#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 14 (cible de poids par exercice) — exit != 0 sinon.
# 1. tsc + next build verts.
# 2. Migration non cassante : exercises.target_weight_kg (numeric null) +
#    target_weight_note (text null) ; exercices existants lisibles avec null,
#    3 baselines + catalogue intacts.
# 3. MCP (HTTP bearer) : set_exercise_target pose/lit/efface une cible ;
#    list_exercises + get_exercise_history la renvoient ; sans cible → null
#    sans erreur (scripts/lot14-mcp-target.mjs).
# 4. DOM : la cible est portée par l'écran séance et reste distincte du dernier
#    fait (scripts/e2e/lot14-dom.mjs). RÉVISÉ AU LOT 19, décision PO : le flux ne
#    garde qu'une ligne « Dernière », la cible / la fourchette / le RPE cible
#    passent derrière le ⓘ, et le champ poids est pré-rempli à l'OBJECTIF (plus au
#    dernier poids fait). Mêmes faits, nouvel emplacement.
# 5. Garde-fou : aucun calcul/écriture de cible côté app (Claude only via MCP).
#
# Local (CI) : serveur local. Distant : exporter BASE_URL=<url> (ex. prod).
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3214
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"
: "${MCP_SECRET:?manquante (env)}"

REST="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
SRV=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
NOTE_ENC="baseline%20seed%20%E2%80%94%20poids%20de%20d%C3%A9part"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"
MCP_URL="${MCP_URL:-$RUN_BASE/api/mcp}"
crange() { curl -s "$1" "${SRV[@]}" -H "Prefer: count=exact" -I 2>/dev/null | tr -d '\r' | sed -n 's#.*content-range: [^/]*/##Ip'; }

cleanup() {
  # `npx next start` n'est qu'un LANCEUR : tuer $SERVER_PID laisse vivre le
  # process `next-server` enfant, qui garde le port. Le contrat suivant croit
  # démarrer son serveur, échoue silencieusement à se lier, et teste en réalité
  # le build périmé du serveur resté là — deux faux échecs (Lots 18 et 19) avant
  # qu'on remonte jusqu'ici. On tue donc les enfants ET ce qui tient le port.
  [ -n "${SERVER_PID:-}" ] && pkill -P "$SERVER_PID" 2>/dev/null || true
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== Lot 14 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Migration non cassante (exercises.target_weight_kg/note) --"
C1=$(curl -s -o /dev/null -w "%{http_code}" "$REST/exercises?select=target_weight_kg,target_weight_note&limit=1" "${SRV[@]}")
[ "$C1" = "200" ] && ok "colonnes target_weight_kg + target_weight_note présentes (200)" || ko "colonnes absentes ($C1)"
EXC=$(crange "$REST/exercises?select=id")
[ -n "$EXC" ] && [ "$EXC" -gt 0 ] && ok "catalogue intact : $EXC exercices lisibles" || ko "catalogue vide/illisible ($EXC)"
BASE=$(crange "$REST/workouts?notes=eq.$NOTE_ENC&select=id")
[ "$BASE" = "3" ] && ok "3 baselines intactes" || ko "baselines = $BASE (attendu 3)"

echo "-- 3. Garde-fou : aucune écriture de cible côté app (MCP only) --"
# Une ÉCRITURE de cible prend deux formes, et deux seulement :
#   - clé d'objet littéral NON précédée d'un point : « target_weight_kg: 80 »,
#     « { target_weight_kg } », « { target_weight_kg, … } », « "target_weight_kg": »
#   - affectation de propriété : « patch.target_weight_kg = 80 »
# Une LECTURE (« exercise.target_weight_kg », y compris suivie d'une virgule)
# n'est ni l'une ni l'autre. Effacer aveuglément tout ce qui suit un point —
# ce que faisait la version précédente — laissait passer les affectations.
# Lot 29 : l'app a désormais LE DROIT de nommer target_weight_kg — mais
# seulement pour le passer à `setExerciseTargetWith`, la fonction partagée avec
# l'outil MCP. Ce qui reste interdit, c'est d'écrire la colonne SOI-MÊME, avec
# ses propres règles. On retire donc du fichier les arguments passés à cette
# fonction avant d'appliquer la détection : sans ça, le chemin autorisé se
# faisait refuser par le garde-fou censé le protéger.
strip_shared_call() {
  awk '
    /setExerciseTargetWith\(/ { skip = 1 }
    skip && /^[[:space:]]*\}\);?[[:space:]]*$/ { skip = 0; next }
    !skip { print }
  ' "$1"
}
target_write() {
  for f in "$@"; do
    strip_shared_call "$f" \
      | grep -qE "(^|[^.[:alnum:]_])target_weight_(kg|note)[[:space:]]*([:,}]|\")" && return 0
    strip_shared_call "$f" \
      | grep -qE "target_weight_(kg|note)[[:space:]]*=[^=>]" && return 0
  done
  return 1
}
if target_write "src/app/(tabs)/training/training-actions.ts" "src/app/(tabs)/today-actions.ts"; then
  ko "une action app écrit une cible EN DIRECT (interdit : il n'y a qu'un chemin)"
else
  ok "aucune action app n'écrit de cible en direct"
fi

# AMENDEMENT (Lot 29, décision PO). La règle « aucune cible posée par l'app »
# est levée pour UN cas : le ✓ d'une proposition de progression. Elle n'est pas
# supprimée, elle est resserrée — l'app ne peut poser une cible que par
# `setExerciseTargetWith`, la fonction que l'outil MCP appelle lui aussi (mêmes
# validations, même garde-fou de signe du Lot 26). Un second écrivain avec ses
# propres règles est ce qu'on refuse, pas l'écriture elle-même.
ACT="src/app/(tabs)/training/training-actions.ts"
if grep -q "setExerciseTargetWith" "$ACT"; then
  ok "le ✓ passe par la fonction partagée avec le MCP (un seul écrivain)"
  # ... et avec le client de SESSION. `mcpDb()` porte la clé service_role et
  # contourne la RLS : un bouton d'interface ne doit pas écrire en privilège
  # élevé, sinon toutes les autres écritures de l'app perdent leur filet.
  # Chercher « mcpDb » matcherait le commentaire qui explique pourquoi on ne
  # l'utilise pas (troisième garde-fou de cette série à tomber dans ce piège).
  # On vise l'IMPORT : pour appeler mcpDb() il faut l'importer, et aucun
  # commentaire n'écrit une ligne d'import.
  grep -qE '^import .*from "@/lib/mcp/db"' "$ACT" \
    && ko "une action app importe mcpDb (service_role) : RLS contournée depuis l'UI" \
    || ok "l'app écrit avec le client de session (RLS appliquée)"
  grep -q "setExerciseTargetWith(supabase," "$ACT" \
    && ok "client de session passé explicitement à la fonction partagée" \
    || ko "client non explicite : impossible de savoir sous quels droits ça écrit"
else
  ok "aucune cible posée par l'app (règle d'origine du Lot 14)"
fi

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot14-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. MCP cible de poids (HTTP bearer) --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   MCP_URL="$MCP_URL" MCP_SECRET="$MCP_SECRET" node scripts/lot14-mcp-target.mjs; then
  ok "MCP : set/list/history/clear cible (voir détail ci-dessus)"
else
  ko "MCP cible (scripts/lot14-mcp-target.mjs)"
fi

echo "-- 6. DOM : cible portée par l'écran séance (repliée depuis le Lot 19) --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot14-dom.mjs; then
  ok "DOM : cible retrouvée derrière le ⓘ + poids pré-rempli à l'objectif"
else
  ko "DOM séance cible (scripts/e2e/lot14-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 14 : INCOMPLET =="; exit 1; fi
echo "== Lot 14 : OK =="
