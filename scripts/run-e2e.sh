#!/usr/bin/env bash
# Lance les tests E2E Playwright contre un serveur local réel.
# Usage : ./scripts/run-e2e.sh [scripts/e2e/xxx.mjs ...]  (défaut : today.mjs)
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3221
if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante}"

SPECS=("$@")
[ ${#SPECS[@]} -eq 0 ] && SPECS=(scripts/e2e/today.mjs)

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Build =="
npm run build >/tmp/e2e-build.log 2>&1 && echo "  build OK" || { echo "  build KO"; tail -20 /tmp/e2e-build.log; exit 1; }

echo "== Serveur local (port $PORT) =="
pkill -f "next start -p $PORT" 2>/dev/null || true
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/e2e-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
echo "  prêt"

FAIL=0
for spec in "${SPECS[@]}"; do
  echo "== $spec =="
  if NODE_USE_ENV_PROXY=1 BASE_URL="http://localhost:$PORT" node "$spec"; then :; else FAIL=1; fi
done
exit $FAIL
