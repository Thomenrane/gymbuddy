#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 13 (préférences alimentaires) — exit != 0 sinon.
# 1. tsc + next build verts.
# 2. Migration food_preferences + seed des 3 préférences initiales (florian :
#    poisson blanc, thon ; sarah : beans) vérifiés en base.
# 3. MCP (HTTP bearer) : get_food_preferences (toutes puis filtrées),
#    add + delete d'une préférence de test, get_partner_profile inclut les
#    préférences de Sarah (scripts/lot13-mcp-prefs.mjs). Seed intact après.
# 4. DOM : l'écran Réglages rendu contient la section préférences éditable
#    (scripts/e2e/lot13-dom.mjs).
# 5. Garde-fou : labels libres, aucun filtrage automatique de recettes.
#
# Local (CI) : serveur local. Distant : exporter BASE_URL=<url> (ex. prod) →
# pas de serveur local, MCP+DOM ciblent l'URL. tsc+build+REST tournent toujours.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3213
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
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"
MCP_URL="${MCP_URL:-$RUN_BASE/api/mcp}"
crange() { curl -s "$1" "${SRV[@]}" -H "Prefer: count=exact" -I 2>/dev/null | tr -d '\r' | sed -n 's#.*content-range: [^/]*/##Ip'; }

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  curl -s -X DELETE "$REST/food_preferences?label=eq.__PREF_TEST__" "${SRV[@]}" -o /dev/null || true
}
trap cleanup EXIT

echo "== Lot 13 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Migration + seed (REST) --"
COL=$(curl -s -o /dev/null -w "%{http_code}" "$REST/food_preferences?select=id&limit=1" "${SRV[@]}")
[ "$COL" = "200" ] && ok "table food_preferences présente (200)" || ko "table absente ($COL)"
FL=$(crange "$REST/food_preferences?person=eq.florian&select=id")
[ "$FL" = "2" ] && ok "florian : 2 préférences seed" || ko "florian = $FL (attendu 2)"
SA=$(crange "$REST/food_preferences?person=eq.sarah&select=id")
[ "$SA" = "1" ] && ok "sarah : 1 préférence seed" || ko "sarah = $SA (attendu 1)"
PB=$(crange "$REST/food_preferences?person=eq.florian&label=eq.poisson%20blanc")
TH=$(crange "$REST/food_preferences?person=eq.florian&label=eq.thon")
BE=$(crange "$REST/food_preferences?person=eq.sarah&label=ilike.*beans*")
[ "$PB" = "1" ] && [ "$TH" = "1" ] && [ "$BE" = "1" ] \
  && ok "seed exact : florian 'poisson blanc' + 'thon', sarah 'beans…'" \
  || ko "seed manquant (poisson blanc=$PB thon=$TH beans=$BE)"

echo "-- 3. Garde-fou : aucun filtrage automatique de recettes --"
grep -qi "recipe" src/lib/food-prefs-server.ts src/components/settings/food-preferences.tsx \
  && ko "le code préférences référence des recettes (filtrage interdit en v1)" \
  || ok "préférences découplées des recettes (pas de filtrage auto)"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot13-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. MCP préférences (HTTP bearer) --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   MCP_URL="$MCP_URL" MCP_SECRET="$MCP_SECRET" node scripts/lot13-mcp-prefs.mjs; then
  ok "MCP : get/add/delete + partner (voir détail ci-dessus)"
else
  ko "MCP préférences (scripts/lot13-mcp-prefs.mjs)"
fi

echo "-- 6. DOM : section préférences éditable (Réglages) --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot13-dom.mjs; then
  ok "DOM : section préférences rendue + éditable (voir détail ci-dessus)"
else
  ko "DOM Réglages préférences (scripts/e2e/lot13-dom.mjs)"
fi

echo "-- 7. Seed intact (après tests) --"
LEFT=$(crange "$REST/food_preferences?label=eq.__PREF_TEST__")
[ "$LEFT" = "0" ] && ok "aucune donnée de test résiduelle" || ko "$LEFT préférence(s) de test restante(s)"

if [ "$FAIL" -ne 0 ]; then echo "== Lot 13 : INCOMPLET =="; exit 1; fi
echo "== Lot 13 : OK =="
