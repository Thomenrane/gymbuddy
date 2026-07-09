#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 8 (retrait Alan, poisson gras seul) — exit != 0.
# 1. tsc + next build verts
# 2. Recherche statique : plus aucune référence à alanCounts / module alan
#    dans le code applicatif ni les scripts (hors historique git).
# 3. Via HTTP + bearer (scripts/lot8-tests.mjs) :
#    - get_summary & get_plan renvoient oily_fish_count, plus alan_counters
#    - oily_fish_count = 2 sur un jeu contenant D2 et L6 (poisson-gras),
#      0 sur un jeu sans saumon
#    - poisson-gras présent sur D2 et L6 en base
#    - tags poisson/pates/hache/legumineuses du seed inchangés
#    - nettoyage vérifié
# 4. Invariants seed : 32 recettes, 3 baselines intactes.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3181
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

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  curl -s -X DELETE "$REST/meal_plan_entries?plan_date=gte.1999-08-02&plan_date=lte.1999-08-08" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/meal_logs?log_date=gte.1999-08-02&log_date=lte.1999-08-08" "${SRV[@]}" -o /dev/null || true
}
trap cleanup EXIT

echo "== Lot 8 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Recherche statique : aucune référence Alan résiduelle --"
# On exclut les fichiers de vérif du lot 8 eux-mêmes : ils DOCUMENTENT le
# retrait (assertions "alan_counters absent") et ne dépendent d'aucun code Alan.
ALAN_PAT="alanCounts\|alan\.mjs\|AlanCount\|AlanCounters\|getAlanWeek\|alan_counters\|ALAN_"
if grep -rn "$ALAN_PAT" src scripts \
     --exclude=verify-lot8.sh --exclude=lot8-tests.mjs >/dev/null 2>&1; then
  echo "  Références trouvées :"
  grep -rn "$ALAN_PAT" src scripts --exclude=verify-lot8.sh --exclude=lot8-tests.mjs || true
  ko "références Alan encore présentes dans src/ ou scripts/"
else
  ok "aucune référence alanCounts / module alan (src + scripts)"
fi
[ ! -e src/lib/alan.mjs ] && [ ! -e src/components/plan/alan-counters.tsx ] \
  && ok "module alan.mjs et composant AlanCounters supprimés" \
  || ko "fichiers Alan encore présents"

echo "-- 3. Serveur local + tools MCP (assertions de contenu) --"
pkill -f "next start -p $PORT" 2>/dev/null || true
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot8-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done
ok "next start prêt (port $PORT)"

if NODE_USE_ENV_PROXY=1 MCP_URL="http://localhost:$PORT/api/mcp" node scripts/lot8-tests.mjs; then
  ok "tests lot 8 : oily_fish_count, plus de alan_counters, tags seed intacts"
else
  ko "tests lot 8 (scripts/lot8-tests.mjs)"
fi

echo "-- 4. Invariants seed --"
# Les 32 recettes du seed = source != 'claude' (les recettes créées par
# Claude en conversation, source='claude', ne font pas partie du seed).
NREC=$(curl -sf "$REST/recipes?source=neq.claude&select=id" "${SRV[@]}" | jget ".length")
NBASE=$(curl -sf "$REST/workouts?notes=eq.baseline%20seed%20%E2%80%94%20poids%20de%20d%C3%A9part&select=id" "${SRV[@]}" | jget ".length")
[ "$NREC" = "32" ] && ok "32 recettes seed intactes" || ko "recettes seed = $NREC (attendu 32)"
[ "$NBASE" = "3" ] && ok "3 baselines intactes" || ko "baselines = $NBASE (attendu 3)"

if [ "$FAIL" -ne 0 ]; then
  echo "== Lot 8 : INCOMPLET =="
  exit 1
fi
echo "== Lot 8 : OK =="
