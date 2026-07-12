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
# 4. DOM : l'écran séance affiche dernier fait + cible + RPE cible pour un exo
#    ayant une cible, dernier fait seul sinon, et le champ poids reste pré-rempli
#    au dernier poids fait — pas la cible (scripts/e2e/lot14-dom.mjs).
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
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
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
if grep -qi "target_weight" "src/app/(tabs)/training/training-actions.ts" "src/app/(tabs)/today-actions.ts"; then
  ko "une action app écrit une cible (interdit — Claude only via MCP)"
else
  ok "aucune action app n'écrit de cible (posée uniquement par Claude via MCP)"
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

echo "-- 6. DOM : dernier fait + cible + RPE cible / pré-remplissage --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot14-dom.mjs; then
  ok "DOM : cible affichée + poids réel = dernier fait (voir détail ci-dessus)"
else
  ko "DOM séance cible (scripts/e2e/lot14-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 14 : INCOMPLET =="; exit 1; fi
echo "== Lot 14 : OK =="
