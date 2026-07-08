#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Phase 4 (serveur MCP) — exit != 0 si incomplet.
# 1. tsc + next build verts
# 2. /api/mcp : rejet sans token et avec token invalide (401)
# 3. Avec MCP_SECRET : les 14 tools du PRD §5 testés avec assertions
#    de contenu (scripts/mcp-test-client.mjs, SDK officiel)
# 4. docs/mcp-setup.md présent
# 5. Nettoyage complet des données de test (dates en 1999)
# Le MCP_SECRET est lu depuis l'env/.env.local et n'est jamais affiché.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3131
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

cleanup_data() {
  curl -s -X DELETE "$REST/meal_logs?log_date=eq.1999-11-20" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/workouts?workout_date=eq.1999-11-20" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/exercises?name=eq.__MCP_TEST_EXO__" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/recipes?name=eq.__MCP_TEST_RECIPE__" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/body_metrics?metric_date=eq.1999-11-20" "${SRV[@]}" -o /dev/null || true
  curl -s -X PATCH "$REST/targets?id=eq.1" "${SRV[@]}" \
    -d '{"kcal":2270,"protein_g":170,"carbs_g":227,"fat_g":76,"fiber_g":38}' -o /dev/null || true
}
cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  cleanup_data
}
trap cleanup EXIT

echo "== Phase 4 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Serveur local --"
pkill -f "next start -p $PORT" 2>/dev/null || true
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-p4-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done
ok "next start prêt (port $PORT)"

MCP="http://localhost:$PORT/api/mcp"
JSONRPC='{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
HDRS=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")

echo "-- 3. Auth bearer --"
NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP" "${HDRS[@]}" -d "$JSONRPC")
[ "$NOAUTH" = "401" ] || [ "$NOAUTH" = "403" ] && ok "sans token → HTTP $NOAUTH" || ko "sans token → HTTP $NOAUTH (attendu 401/403)"
BADAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP" "${HDRS[@]}" \
  -H "Authorization: Bearer invalide-$(date +%s)" -d "$JSONRPC")
[ "$BADAUTH" = "401" ] || [ "$BADAUTH" = "403" ] && ok "token invalide → HTTP $BADAUTH" || ko "token invalide → HTTP $BADAUTH (attendu 401/403)"

# Canal additionnel ?key= (FLAG 10 — UI connecteurs Claude.ai sans champ bearer).
# Les URLs contenant le secret ne sont jamais affichées.
TMPRESP=$(mktemp)
KEYOK=$(curl -s -o "$TMPRESP" -w "%{http_code}" -X POST "$MCP?key=$MCP_SECRET" "${HDRS[@]}" -d "$JSONRPC")
[ "$KEYOK" = "200" ] && grep -q "get_targets" "$TMPRESP" \
  && ok "?key= valide → 200 + tools listés" || ko "?key= valide → HTTP $KEYOK"
KEYBAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP?key=invalide-cle" "${HDRS[@]}" -d "$JSONRPC")
[ "$KEYBAD" = "401" ] || [ "$KEYBAD" = "403" ] && ok "?key= invalide → HTTP $KEYBAD" || ko "?key= invalide → HTTP $KEYBAD (attendu 401/403)"
HDRONLY=$(curl -s -o "$TMPRESP" -w "%{http_code}" -X POST "$MCP" "${HDRS[@]}" \
  -H "Authorization: Bearer $MCP_SECRET" -d "$JSONRPC")
[ "$HDRONLY" = "200" ] && grep -q "get_targets" "$TMPRESP" \
  && ok "header Bearer seul → 200 + tools listés (canal préservé)" || ko "header seul → HTTP $HDRONLY"
rm -f "$TMPRESP"

echo "-- 4. Les 14 tools (assertions de contenu) --"
if MCP_URL="$MCP" node scripts/mcp-test-client.mjs; then
  ok "client MCP : 14 tools validés"
else
  ko "client MCP"
fi

echo "-- 5. Documentation --"
check "docs/mcp-setup.md présent" test -s docs/mcp-setup.md
if grep -rn "$MCP_SECRET" --exclude-dir=node_modules --exclude-dir=.next --exclude=".env.local" . >/dev/null 2>&1; then
  ko "MCP_SECRET trouvé en dur dans le repo !"
else
  ok "MCP_SECRET absent du code et de la doc"
fi

echo "-- 6. Nettoyage --"
cleanup_data
LEFT=$(curl -sf "$REST/recipes?name=eq.__MCP_TEST_RECIPE__&select=id" "${SRV[@]}")
LEFT2=$(curl -sf "$REST/workouts?workout_date=eq.1999-11-20&select=id" "${SRV[@]}")
LEFT3=$(curl -sf "$REST/exercises?name=eq.__MCP_TEST_EXO__&select=id" "${SRV[@]}")
[ "$LEFT$LEFT2$LEFT3" = "[][][]" ] && ok "zéro donnée de test restante" || ko "restes: $LEFT $LEFT2 $LEFT3"

if [ "$FAIL" -ne 0 ]; then
  echo "== Phase 4 : INCOMPLÈTE =="
  exit 1
fi
echo "== Phase 4 : OK =="
