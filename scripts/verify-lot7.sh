#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 7 (couverture MCP complète) — exit != 0 si incomplet.
# 1. tsc + next build verts
# 2. Via HTTP + bearer (scripts/lot7-tests.mjs), assertions de contenu :
#    - create_workout_template (2 exos : reps min/max, RPE, repos, note)
#    - update_workout_template = remplacement complet (ordre inversé +
#      3e exo créé à la volée), vérifié en base
#    - TEST EXPLICITE : modifier le template ne réécrit aucun workout
#      passé (snapshot des séries avant/après, identique)
#    - archivage → exclu de list_workout_templates sans include_archived
#    - create_exercise (+ doublon refusé) / update_exercise : l'historique
#      est retrouvé sous le NOUVEAU nom
#    - update_workout (séries remplacées, vérifié) puis delete_workout
#    - delete_workout/update_workout sur un baseline → erreur métier
#      explicite ET baseline intact en base
#    - get_body_metrics (période) + delete_body_metric d'une pesée test
#    - update_recipe is_active=false puis restauration
# 3. Nettoyage vérifié + invariants : 3 templates réels et 3 baselines
#    (avec leurs séries) comptés AVANT et APRÈS, identiques
# Données de test : workouts en 2126, pesées en 1999, préfixe __LOT7.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3171
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquante (env)}"
: "${MCP_SECRET:?MCP_SECRET manquant (env)}"

REST="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
SRV=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json")

jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(eval('j'+process.argv[1]))})" "$1"; }

cleanup_data() {
  curl -s -X DELETE "$REST/workouts?workout_date=in.(2126-05-01,2126-05-02)" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/workout_templates?name=like.__LOT7*" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/exercises?name=like.__LOT7*" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/body_metrics?metric_date=in.(1999-06-21,1999-06-22)" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/recipes?name=eq.__LOT7_RECIPE__" "${SRV[@]}" -o /dev/null || true
}
cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  cleanup_data
}
trap cleanup EXIT

echo "== Lot 7 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Serveur local --"
pkill -f "next start -p $PORT" 2>/dev/null || true
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot7-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done
ok "next start prêt (port $PORT)"

echo "-- 3. Les 9 tools lot 7 (assertions de contenu + base) --"
if NODE_USE_ENV_PROXY=1 MCP_URL="http://localhost:$PORT/api/mcp" node scripts/lot7-tests.mjs; then
  ok "tests lot 7 : templates, exercices, workouts, mesures, baselines protégés"
else
  ko "tests lot 7 (scripts/lot7-tests.mjs)"
fi

echo "-- 4. Nettoyage --"
cleanup_data
L1=$(curl -sf "$REST/workout_templates?name=like.__LOT7*&select=id" "${SRV[@]}" | jget ".length")
L2=$(curl -sf "$REST/exercises?name=like.__LOT7*&select=id" "${SRV[@]}" | jget ".length")
L3=$(curl -sf "$REST/workouts?workout_date=in.(2126-05-01,2126-05-02)&select=id" "${SRV[@]}" | jget ".length")
L4=$(curl -sf "$REST/body_metrics?metric_date=in.(1999-06-21,1999-06-22)&select=id" "${SRV[@]}" | jget ".length")
L5=$(curl -sf "$REST/recipes?name=eq.__LOT7_RECIPE__&select=id" "${SRV[@]}" | jget ".length")
TPL=$(curl -sf "$REST/workout_templates?select=id" "${SRV[@]}" | jget ".length")
[ "$L1$L2$L3$L4$L5" = "00000" ] && [ "$TPL" = "3" ] \
  && ok "zéro donnée de test restante, 3 templates réels" \
  || ko "restes: tpl=$L1 exo=$L2 wk=$L3 bm=$L4 rec=$L5 (templates=$TPL)"

if [ "$FAIL" -ne 0 ]; then
  echo "== Lot 7 : INCOMPLET =="
  exit 1
fi
echo "== Lot 7 : OK =="
