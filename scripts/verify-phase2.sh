#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Phase 2 (Aujourd'hui + Réglages) — exit != 0 si incomplet.
# 1. tsc + next build verts
# 2. Timezone (test explicite) : un log à 23h30 Europe/Brussels appartient
#    au bon jour local — via le module src/lib/brussels-day.mjs utilisé
#    par l'app à l'insertion (été, hiver, et minuit passé)
# 3. Contre Supabase : log recette ×1.25 (macros dénormalisées vérifiées
#    par calcul indépendant), log libre, édition, suppression, upsert
#    body_metric (2 écritures même date = 1 ligne), totaux du jour vs
#    targets, update targets puis restauration 2270/170/227/76
# 4. Immutabilité (test explicite) : modifier la recette source ne change
#    pas les macros d'un log existant
# 5. Nettoyage complet des données de test
# Dates de test en 1999 pour ne jamais toucher les vraies données.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquante (env)}"

REST="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
SRV=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json")
D1="1999-12-30" # jour "totaux"
D2="1999-12-31" # jour "pesée"

jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(eval('j'+process.argv[1]))})" "$1"; }

cleanup() {
  curl -s -X DELETE "$REST/meal_logs?log_date=in.($D1,$D2)" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/body_metrics?metric_date=in.($D1,$D2)" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/recipes?name=eq.__VERIFY_PHASE2__" "${SRV[@]}" -o /dev/null || true
  curl -s -X PATCH "$REST/targets?id=eq.1" "${SRV[@]}" \
    -d '{"kcal":2270,"protein_g":170,"carbs_g":227,"fat_g":76,"fiber_g":38}' -o /dev/null || true
}
trap cleanup EXIT

echo "== Phase 2 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Timezone Europe/Brussels (module de l'app) --"
node --input-type=module -e "
import { brusselsDay } from './src/lib/brussels-day.mjs';
const cases = [
  ['2026-07-08T21:30:00Z', '2026-07-08', 'été : 23h30 Bruxelles -> jour même'],
  ['2026-07-08T22:30:00Z', '2026-07-09', 'été : 00h30 Bruxelles -> lendemain (piège UTC)'],
  ['2026-01-15T22:30:00Z', '2026-01-15', 'hiver : 23h30 Bruxelles -> jour même'],
  ['2026-01-15T23:30:00Z', '2026-01-16', 'hiver : 00h30 Bruxelles -> lendemain (piège UTC)'],
];
let fail = 0;
for (const [instant, expected, label] of cases) {
  const got = brusselsDay(instant);
  console.log(\`  \${got === expected ? 'OK  ' : 'FAIL'} \${label} (\${got})\`);
  if (got !== expected) fail = 1;
}
process.exit(fail);
" || FAIL=1

echo "-- 3. Log recette ×1.25 : macros dénormalisées vérifiées par calcul --"
PD1=$(curl -sf "$REST/recipes?code=eq.PD1&select=id,kcal,protein_g,carbs_g,fat_g" "${SRV[@]}")
PD1_ID=$(echo "$PD1" | jget "[0].id")
read -r EXP_KCAL EXP_P EXP_G EXP_L <<< "$(echo "$PD1" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const r=JSON.parse(d)[0], f=1.25, m=(x)=>Math.round(x*f*10)/10;
  console.log(Math.round(r.kcal*f), m(r.protein_g), m(r.carbs_g), m(r.fat_g));
})")"
LOG=$(curl -sf -X POST "$REST/meal_logs" "${SRV[@]}" -H "Prefer: return=representation" -d "{
  \"log_date\": \"$D1\", \"slot\": \"petit_dej\", \"recipe_id\": \"$PD1_ID\",
  \"portion_factor\": 1.25, \"kcal\": $EXP_KCAL, \"protein_g\": $EXP_P,
  \"carbs_g\": $EXP_G, \"fat_g\": $EXP_L }")
LOG_ID=$(echo "$LOG" | jget "[0].id")
STORED=$(curl -sf "$REST/meal_logs?id=eq.$LOG_ID&select=kcal,protein_g,carbs_g,fat_g,portion_factor" "${SRV[@]}")
echo "$STORED" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const s=JSON.parse(d)[0];
  const okAll = s.kcal===$EXP_KCAL && Number(s.protein_g)===$EXP_P
    && Number(s.carbs_g)===$EXP_G && Number(s.fat_g)===$EXP_L
    && Number(s.portion_factor)===1.25;
  console.log(\`  \${okAll?'OK  ':'FAIL'} PD1 ×1.25 -> \${s.kcal} kcal / \${s.protein_g} P / \${s.carbs_g} G / \${s.fat_g} L (attendu $EXP_KCAL/$EXP_P/$EXP_G/$EXP_L)\`);
  process.exit(okAll?0:1);
})" || FAIL=1

echo "-- 4. Log libre + édition + suppression --"
FREE=$(curl -sf -X POST "$REST/meal_logs" "${SRV[@]}" -H "Prefer: return=representation" -d "{
  \"log_date\": \"$D1\", \"slot\": \"extra\", \"free_label\": \"__resto test__\",
  \"kcal\": 800, \"protein_g\": 30, \"carbs_g\": 90, \"fat_g\": 35 }")
FREE_ID=$(echo "$FREE" | jget "[0].id")
[ -n "$FREE_ID" ] && ok "log libre créé (800 kcal manuels)" || ko "log libre"

curl -sf -X PATCH "$REST/meal_logs?id=eq.$FREE_ID" "${SRV[@]}" \
  -d '{"kcal": 750, "slot": "diner", "notes": "édité"}' -o /dev/null
EDITED=$(curl -sf "$REST/meal_logs?id=eq.$FREE_ID&select=kcal,slot,notes" "${SRV[@]}")
[ "$(echo "$EDITED" | jget "[0].kcal")" = "750" ] && [ "$(echo "$EDITED" | jget "[0].slot")" = "diner" ] \
  && ok "édition (kcal 800→750, slot extra→diner)" || ko "édition"

curl -sf -X DELETE "$REST/meal_logs?id=eq.$FREE_ID" "${SRV[@]}" -o /dev/null
LEFT=$(curl -sf "$REST/meal_logs?id=eq.$FREE_ID&select=id" "${SRV[@]}")
[ "$LEFT" = "[]" ] && ok "suppression du log" || ko "suppression"

echo "-- 5. Pesée : upsert par date (2 écritures = 1 ligne) --"
UPS=(-H "Prefer: resolution=merge-duplicates,return=representation")
curl -sf -X POST "$REST/body_metrics?on_conflict=metric_date" "${SRV[@]}" "${UPS[@]}" \
  -d "{\"metric_date\": \"$D2\", \"weight_kg\": 82.0}" -o /dev/null
curl -sf -X POST "$REST/body_metrics?on_conflict=metric_date" "${SRV[@]}" "${UPS[@]}" \
  -d "{\"metric_date\": \"$D2\", \"weight_kg\": 81.6, \"waist_cm\": 88}" -o /dev/null
ROWS=$(curl -sf "$REST/body_metrics?metric_date=eq.$D2&select=weight_kg,waist_cm" "${SRV[@]}")
COUNT=$(echo "$ROWS" | jget ".length")
W=$(echo "$ROWS" | jget "[0].weight_kg")
[ "$COUNT" = "1" ] && [ "$W" = "81.6" ] \
  && ok "upsert : 1 ligne, dernière valeur gagne (81.6 kg)" || ko "upsert ($COUNT lignes, $W kg)"

echo "-- 6. Totaux du jour vs cibles --"
DAY=$(curl -sf "$REST/meal_logs?log_date=eq.$D1&select=kcal,protein_g" "${SRV[@]}")
TGT=$(curl -sf "$REST/targets?id=eq.1&select=kcal,protein_g,carbs_g,fat_g" "${SRV[@]}")
echo "$DAY" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const logs=JSON.parse(d);
  const total=logs.reduce((s,l)=>s+l.kcal,0);
  const tgt=JSON.parse(process.argv[1])[0];
  const okT = total===$EXP_KCAL && tgt.kcal===2270;
  console.log(\`  \${okT?'OK  ':'FAIL'} totaux jour test = \${total} kcal (1 log), delta vs cible = \${tgt.kcal-total}\`);
  process.exit(okT?0:1);
})" "$TGT" || FAIL=1

echo "-- 7. Cibles : modification puis restauration --"
curl -sf -X PATCH "$REST/targets?id=eq.1" "${SRV[@]}" \
  -d '{"kcal":2500,"protein_g":180,"carbs_g":230,"fat_g":80}' -o /dev/null
[ "$(curl -sf "$REST/targets?id=eq.1&select=kcal" "${SRV[@]}" | jget "[0].kcal")" = "2500" ] \
  && ok "cibles modifiées (2500 kcal)" || ko "modification cibles"
curl -sf -X PATCH "$REST/targets?id=eq.1" "${SRV[@]}" \
  -d '{"kcal":2270,"protein_g":170,"carbs_g":227,"fat_g":76,"fiber_g":38}' -o /dev/null
RESTORED=$(curl -sf "$REST/targets?id=eq.1&select=kcal,protein_g,carbs_g,fat_g" "${SRV[@]}")
[ "$(echo "$RESTORED" | jget "[0].kcal")" = "2270" ] && [ "$(echo "$RESTORED" | jget "[0].protein_g")" = "170" ] \
  && [ "$(echo "$RESTORED" | jget "[0].carbs_g")" = "227" ] && [ "$(echo "$RESTORED" | jget "[0].fat_g")" = "76" ] \
  && ok "cibles restaurées à 2270/170/227/76" || ko "restauration cibles"

echo "-- 8. Immutabilité : modifier la recette ne réécrit pas le log --"
TR=$(curl -sf -X POST "$REST/recipes" "${SRV[@]}" -H "Prefer: return=representation" -d '{
  "name": "__VERIFY_PHASE2__", "category": "collation", "kcal": 400,
  "protein_g": 40, "carbs_g": 30, "fat_g": 10,
  "ingredients": [{"item": "test", "qty": 1, "unit": "g"}], "source": "florian"}')
TR_ID=$(echo "$TR" | jget "[0].id")
IMLOG=$(curl -sf -X POST "$REST/meal_logs" "${SRV[@]}" -H "Prefer: return=representation" -d "{
  \"log_date\": \"$D1\", \"slot\": \"collation\", \"recipe_id\": \"$TR_ID\",
  \"portion_factor\": 1, \"kcal\": 400, \"protein_g\": 40, \"carbs_g\": 30, \"fat_g\": 10 }")
IMLOG_ID=$(echo "$IMLOG" | jget "[0].id")
curl -sf -X PATCH "$REST/recipes?id=eq.$TR_ID" "${SRV[@]}" -d '{"kcal": 999, "protein_g": 1}' -o /dev/null
AFTER=$(curl -sf "$REST/meal_logs?id=eq.$IMLOG_ID&select=kcal,protein_g" "${SRV[@]}")
[ "$(echo "$AFTER" | jget "[0].kcal")" = "400" ] && [ "$(echo "$AFTER" | jget "[0].protein_g")" = "40" ] \
  && ok "recette passée à 999 kcal → log toujours à 400 kcal / 40 P (figé)" \
  || ko "immutabilité violée : $AFTER"

echo "-- 9. Nettoyage --"
cleanup
LEFT_LOGS=$(curl -sf "$REST/meal_logs?log_date=in.($D1,$D2)&select=id" "${SRV[@]}" | jget ".length")
LEFT_BM=$(curl -sf "$REST/body_metrics?metric_date=in.($D1,$D2)&select=id" "${SRV[@]}" | jget ".length")
LEFT_R=$(curl -sf "$REST/recipes?name=eq.__VERIFY_PHASE2__&select=id" "${SRV[@]}" | jget ".length")
[ "$LEFT_LOGS$LEFT_BM$LEFT_R" = "000" ] && ok "zéro donnée de test restante" || ko "restes: logs=$LEFT_LOGS bm=$LEFT_BM recettes=$LEFT_R"

if [ "$FAIL" -ne 0 ]; then
  echo "== Phase 2 : INCOMPLÈTE =="
  exit 1
fi
echo "== Phase 2 : OK =="
