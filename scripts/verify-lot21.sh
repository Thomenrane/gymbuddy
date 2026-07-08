#!/usr/bin/env bash
# ============================================================
# Contrat de fin du Lot 2.1 (presets de log libre) — exit != 0 si incomplet.
# 1. tsc + next build verts
# 2. Migration non cassante : insertion SANS is_estimate → false + lisible
# 3. Log libre depuis un preset : is_estimate=true + macros du preset
# 4. Log libre preset avec override manuel : is_estimate reste true (FLAG 9)
# 5. Bonus PO : les 3 workouts baseline exclus de get_summary/get_workouts
#    MCP, conservés dans get_exercise_history (serveur local + bearer)
# 6. Nettoyage complet (dates de test en 1999)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3141
D="1999-10-10"
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquante}"
: "${MCP_SECRET:?MCP_SECRET manquant}"

REST="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
SRV=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json")
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(eval('j'+process.argv[1]))})" "$1"; }

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  curl -s -X DELETE "$REST/meal_logs?log_date=eq.$D" "${SRV[@]}" -o /dev/null || true
}
trap cleanup EXIT

echo "== Lot 2.1 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Migration non cassante --"
LEGACY=$(curl -sf -X POST "$REST/meal_logs" "${SRV[@]}" -H "Prefer: return=representation" -d "{
  \"log_date\": \"$D\", \"slot\": \"extra\", \"free_label\": \"__historique sans is_estimate__\",
  \"kcal\": 400, \"protein_g\": 10, \"carbs_g\": 40, \"fat_g\": 15 }")
[ "$(echo "$LEGACY" | jget "[0].is_estimate")" = "false" ] \
  && ok "insertion sans is_estimate → default false, log lisible" \
  || ko "default is_estimate"

echo "-- 3. Log libre depuis preset (Repas moyen : 800/35/80/35) --"
PRESET=$(curl -sf -X POST "$REST/meal_logs" "${SRV[@]}" -H "Prefer: return=representation" -d "{
  \"log_date\": \"$D\", \"slot\": \"diner\", \"free_label\": \"__resto preset__\",
  \"kcal\": 800, \"protein_g\": 35, \"carbs_g\": 80, \"fat_g\": 35, \"is_estimate\": true }")
[ "$(echo "$PRESET" | jget "[0].is_estimate")" = "true" ] && [ "$(echo "$PRESET" | jget "[0].kcal")" = "800" ] \
  && [ "$(echo "$PRESET" | jget "[0].protein_g")" = "35" ] \
  && ok "preset : is_estimate=true + macros du preset (800 kcal / 35 P)" || ko "log preset"

echo "-- 4. Preset avec override manuel (FLAG 9) --"
OVERRIDE=$(curl -sf -X POST "$REST/meal_logs" "${SRV[@]}" -H "Prefer: return=representation" -d "{
  \"log_date\": \"$D\", \"slot\": \"diner\", \"free_label\": \"__resto override__\",
  \"kcal\": 950, \"protein_g\": 40, \"carbs_g\": 80, \"fat_g\": 35, \"is_estimate\": true }")
[ "$(echo "$OVERRIDE" | jget "[0].is_estimate")" = "true" ] && [ "$(echo "$OVERRIDE" | jget "[0].kcal")" = "950" ] \
  && ok "override (800→950 kcal) : is_estimate reste true" || ko "override"

echo "-- 5. Baselines exclues des stats MCP (serveur local) --"
pkill -f "next start -p $PORT" 2>/dev/null || true
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-l21-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done

# Attendu : nombre de muscu NON-baseline réellement en base sur la semaine
EXPECTED_MUSCU=$(curl -sf "$REST/workouts?workout_date=gte.2026-07-06&workout_date=lte.2026-07-12&type=eq.muscu&select=notes" "${SRV[@]}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).filter(w=>w.notes!=='baseline seed — poids de départ').length))")

EXPECTED_MUSCU="$EXPECTED_MUSCU" MCP_URL="http://localhost:$PORT/api/mcp" node --input-type=module -e "
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const c = new Client({ name: 'verify-lot21', version: '1.0.0' });
await c.connect(new StreamableHTTPClientTransport(new URL(process.env.MCP_URL), {
  requestInit: { headers: { Authorization: 'Bearer ' + process.env.MCP_SECRET } },
}));
const call = async (name, args) => JSON.parse((await c.callTool({ name, arguments: args })).content[0].text);
let fail = 0;
const chk = (label, cond) => { console.log(\`  \${cond ? 'OK  ' : 'FAIL'} \${label}\`); if (!cond) fail = 1; };

// Les 3 baselines sont datées du 2026-07-08 (jour du seed)
const wk = await call('get_workouts', { start_date: '2026-07-08', end_date: '2026-07-08' });
chk('get_workouts 2026-07-08 : baselines exclues', !wk.workouts.some(w => w.notes === 'baseline seed — poids de départ'));
const day = await call('get_day', { date: '2026-07-08' });
chk('get_day 2026-07-08 : baselines exclues', !day.workouts.some(w => w.notes === 'baseline seed — poids de départ'));
const sum = await call('get_summary', { start_date: '2026-07-06', end_date: '2026-07-12' });
const expected = Number(process.env.EXPECTED_MUSCU);
chk(\`get_summary : muscu de la semaine = \${expected} (les 3 baselines exclues)\`, (sum.workouts_by_type.muscu ?? 0) === expected);
const hist = await call('get_exercise_history', { exercise_name: 'Back Squat' });
chk('get_exercise_history : baseline Back Squat 70 kg conservée', hist.workouts.some(w => w.sets.some(s => Number(s.weight_kg) === 70)));
await c.close();
process.exit(fail);
" || FAIL=1

echo "-- 6. Nettoyage --"
curl -s -X DELETE "$REST/meal_logs?log_date=eq.$D" "${SRV[@]}" -o /dev/null
LEFT=$(curl -sf "$REST/meal_logs?log_date=eq.$D&select=id" "${SRV[@]}")
[ "$LEFT" = "[]" ] && ok "zéro donnée de test restante" || ko "restes: $LEFT"

if [ "$FAIL" -ne 0 ]; then
  echo "== Lot 2.1 : INCOMPLET =="
  exit 1
fi
echo "== Lot 2.1 : OK =="
