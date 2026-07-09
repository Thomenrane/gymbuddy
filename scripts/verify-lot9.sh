#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 9 (recettes sans code planifiables) — exit != 0.
# 1. tsc + next build verts
# 2. Via HTTP + bearer (scripts/lot9-tests.mjs), assertions de contenu :
#    (1) add_recipe crée une recette SANS code (code=null)
#    (2) plan_week la planifie par recipe_id ; get_plan la relit (macros)
#    (3) plan_week avec un recipe_id inconnu dans un lot valide n'écrit RIEN
#    (4) log_meal accepte recipe_id et dénormalise les macros (×2)
#    (5) add_recipe avec un code déjà pris (PD1) → erreur, rien écrit
#    (6) update_recipe attribue un code, puis plan_week fonctionne par code
#    (7) recipe_code + recipe_id incohérents → erreur métier
#    + régression : plan_week par recipe_code seul fonctionne toujours
#    + nettoyage ; seed PD1 intact ; 32 seed + 4 'claude' intactes.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3191
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

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  curl -s -X DELETE "$REST/meal_plan_entries?plan_date=gte.1999-09-06&plan_date=lte.1999-09-08" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/meal_logs?log_date=gte.1999-09-06&log_date=lte.1999-09-08" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/recipes?name=like.__LOT9*" "${SRV[@]}" -o /dev/null || true
}
trap cleanup EXIT

echo "== Lot 9 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Serveur local --"
pkill -f "next start -p $PORT" 2>/dev/null || true
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot9-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done
ok "next start prêt (port $PORT)"

echo "-- 3. Recettes sans code planifiables (assertions de contenu + base) --"
if NODE_USE_ENV_PROXY=1 MCP_URL="http://localhost:$PORT/api/mcp" node scripts/lot9-tests.mjs; then
  ok "tests lot 9 : recipe_id, atomicité, code optionnel, incohérence"
else
  ko "tests lot 9 (scripts/lot9-tests.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "== Lot 9 : INCOMPLET =="
  exit 1
fi
echo "== Lot 9 : OK =="
