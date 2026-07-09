#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Phase 6 (planificateur) — exit != 0 si incomplet.
# 1. tsc + next build verts
# 2. Modules purs (ceux que l'app utilise) :
#    - mondayOf : semaine lundi→dimanche
#    - aggregateShoppingList sur un cas connu : ingrédient en grammes
#      partagé par 2 recettes sommé, pièces non converties, ×1.5 appliqué
# 3. Via Supabase : upsert (plan_date, slot) = REMPLACEMENT (FLAG 8),
#    vérifié au niveau base (2 upserts → 1 ligne, dernière gagne)
# 4. Via HTTP + bearer : les 5 tools MCP plan avec assertions de contenu
#    (scripts/plan-tests.mjs) — plan_week ATOMIQUE (un code invalide
#    n'écrit rien), totaux/jour vs calcul indépendant, flux "logger
#    depuis le plan" (meal_log = recette × portion du plan)
# 5. Nettoyage complet (semaine de test 1999-06-07, recettes ZPT1/ZPT2)
# Aucun solveur de génération dans l'app (non-goal v2.1) : la génération
# de semaine reste une conversation Claude via plan_week.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3161
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
MON="1999-06-07" # lundi de la semaine de test
SUN="1999-06-13"

jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(eval('j'+process.argv[1]))})" "$1"; }

cleanup_data() {
  curl -s -X DELETE "$REST/meal_plan_entries?plan_date=gte.$MON&plan_date=lte.$SUN" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/meal_logs?log_date=gte.$MON&log_date=lte.$SUN" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/recipes?code=in.(ZPT1,ZPT2)" "${SRV[@]}" -o /dev/null || true
}
cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  cleanup_data
}
trap cleanup EXIT

echo "== Phase 6 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Modules purs (utilisés par l'app) --"
node --input-type=module -e "
import { mondayOf } from './src/lib/brussels-day.mjs';
import { aggregateShoppingList, shoppingListAsText } from './src/lib/shopping-list.mjs';
let fail = 0;
const t = (label, cond) => {
  console.log(\`  \${cond ? 'OK  ' : 'FAIL'} \${label}\`);
  if (!cond) fail = 1;
};
t('mondayOf : mercredi → lundi de la même semaine', mondayOf('1999-06-09') === '1999-06-07');
t('mondayOf : dimanche → lundi PRÉCÉDENT (semaine lun→dim)', mondayOf('1999-06-13') === '1999-06-07');
t('mondayOf : lundi → lui-même', mondayOf('1999-06-07') === '1999-06-07');

// Cas connu : 2 recettes partagent 'riz' en g ; œufs en pièce ; ×1.5.
const entries = [
  { portion_factor: 1, recipe: { ingredients: [
    { item: 'Riz basmati', qty: 80, unit: 'g' },
    { item: 'Œufs', qty: 2, unit: 'pièce' },
  ]}},
  { portion_factor: 1.5, recipe: { ingredients: [
    { item: 'riz basmati', qty: 40, unit: 'g' },
    { item: 'Tomates', qty: 2, unit: 'pièce' },
  ]}},
];
const items = aggregateShoppingList(entries);
const find = (name, unit) => items.find((i) => i.item.toLowerCase() === name && i.unit === unit);
t('ingrédient en g partagé sommé : riz 80 + 40×1.5 = 140 g', find('riz basmati', 'g')?.qty === 140);
t('pièces non converties : œufs restent 2 pièce', find('œufs', 'pièce')?.qty === 2);
t('portion_factor 1.5 appliqué : tomates 2×1.5 = 3 pièce', find('tomates', 'pièce')?.qty === 3);
t('une seule ligne pour le riz (pas de doublon g/casse)', items.filter((i) => i.item.toLowerCase() === 'riz basmati').length === 1);
t('rayons : riz → féculents, œufs → protéines, tomates → légumes-fruits',
  find('riz basmati', 'g')?.rayon === 'féculents'
  && find('œufs', 'pièce')?.rayon === 'protéines'
  && find('tomates', 'pièce')?.rayon === 'légumes-fruits');
const text = shoppingListAsText(items);
t('texte copiable groupé par rayon', text.includes('FÉCULENTS') && text.toLowerCase().includes('riz basmati : 140 g'));
process.exit(fail);
" || FAIL=1

echo "-- 3. Base : unique(plan_date, slot) → upsert = remplacement --"
cleanup_data
PD1_ID=$(curl -sf "$REST/recipes?code=eq.PD1&select=id" "${SRV[@]}" | jget "[0].id")
D1_ID=$(curl -sf "$REST/recipes?code=eq.D1&select=id" "${SRV[@]}" | jget "[0].id")
UPS=(-H "Prefer: resolution=merge-duplicates,return=representation")
curl -sf -X POST "$REST/meal_plan_entries?on_conflict=plan_date,slot" "${SRV[@]}" "${UPS[@]}" \
  -d "{\"plan_date\": \"$MON\", \"slot\": \"petit_dej\", \"recipe_id\": \"$PD1_ID\", \"portion_factor\": 1}" -o /dev/null
curl -sf -X POST "$REST/meal_plan_entries?on_conflict=plan_date,slot" "${SRV[@]}" "${UPS[@]}" \
  -d "{\"plan_date\": \"$MON\", \"slot\": \"petit_dej\", \"recipe_id\": \"$D1_ID\", \"portion_factor\": 1.5}" -o /dev/null
ROWS=$(curl -sf "$REST/meal_plan_entries?plan_date=eq.$MON&slot=eq.petit_dej&select=recipe_id,portion_factor" "${SRV[@]}")
COUNT=$(echo "$ROWS" | jget ".length")
GOT_ID=$(echo "$ROWS" | jget "[0].recipe_id")
GOT_F=$(echo "$ROWS" | jget "[0].portion_factor")
[ "$COUNT" = "1" ] && [ "$GOT_ID" = "$D1_ID" ] && [ "$GOT_F" = "1.5" ] \
  && ok "2 upserts même jour+slot → 1 ligne, dernière gagne (D1 ×1.5)" \
  || ko "upsert remplacement ($COUNT lignes)"
curl -s -X DELETE "$REST/meal_plan_entries?plan_date=eq.$MON" "${SRV[@]}" -o /dev/null

echo "-- 4. Serveur local + 5 tools MCP (assertions de contenu) --"
pkill -f "next start -p $PORT" 2>/dev/null || true
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-p6-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done
ok "next start prêt (port $PORT)"

if NODE_USE_ENV_PROXY=1 MCP_URL="http://localhost:$PORT/api/mcp" node scripts/plan-tests.mjs; then
  ok "tests plan : 5 tools + atomicité + logger depuis le plan"
else
  ko "tests plan (scripts/plan-tests.mjs)"
fi

echo "-- 5. Nettoyage --"
cleanup_data
L1=$(curl -sf "$REST/meal_plan_entries?plan_date=gte.$MON&plan_date=lte.$SUN&select=id" "${SRV[@]}" | jget ".length")
L2=$(curl -sf "$REST/meal_logs?log_date=gte.$MON&log_date=lte.$SUN&select=id" "${SRV[@]}" | jget ".length")
L3=$(curl -sf "$REST/recipes?code=in.(ZPT1,ZPT2)&select=id" "${SRV[@]}" | jget ".length")
[ "$L1$L2$L3" = "000" ] && ok "zéro donnée de test restante" || ko "restes: plan=$L1 logs=$L2 recettes=$L3"

if [ "$FAIL" -ne 0 ]; then
  echo "== Phase 6 : INCOMPLÈTE =="
  exit 1
fi
echo "== Phase 6 : OK =="
