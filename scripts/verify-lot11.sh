#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 11 (mode couple) — exit != 0 si non atteint.
# 1. tsc + next build verts.
# 2. Module pur src/lib/couple.mjs (partagé app + MCP) : dérivation de la
#    part PO/Sarah, garde-fou 0<po_share<1, totaux plan, courses (plat entier).
# 3. Garde-fou EN BASE (CHECK) : un log/plan for_two avec po_share=0 (ou 1)
#    est REJETÉ ; un solo avec po_share≠1 est REJETÉ ; les cas valides passent.
#    → prouve que Sarah ne peut pas casser la dérivation (division par zéro).
# 4. Câblage : les 2 tools partenaire sont enregistrés ; le solo reste par
#    défaut (colonnes for_two default false).
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
SRV=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
TESTDATE="1999-11-11"

cleanup() {
  curl -s -X DELETE "$REST/meal_logs?log_date=eq.$TESTDATE" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/meal_plan_entries?plan_date=eq.$TESTDATE" "${SRV[@]}" -o /dev/null || true
}
trap cleanup EXIT

# Code HTTP d'un POST d'insertion (201 = accepté, 4xx = rejeté par la base).
post_code() {
  local table="$1" body="$2"
  curl -s -o /dev/null -w "%{http_code}" -X POST "$REST/$table" "${SRV[@]}" \
    -H "Content-Type: application/json" -d "$body"
}

echo "== Lot 11 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Module pur couple.mjs (app + MCP + courses) --"
node --input-type=module -e "
import { poLogMacros, sarahShareFromLog, assertCoupleShare, planEntryMacros, shoppingFactor, pctOfTargets, sarahDayTotals } from './src/lib/couple.mjs';
import { aggregateShoppingList } from './src/lib/shopping-list.mjs';
let fail=0; const t=(l,c)=>{console.log(\`  \${c?'OK  ':'FAIL'} \${l}\`); if(!c) fail=1;};
const R={kcal:600,protein_g:45,carbs_g:60,fat_g:20};

// Solo inchangé : part PO = recette × portion.
t('solo : part PO = recette × portion', poLogMacros(R,1,false,1).kcal===600);

// Couple : part PO stockée = recette × portion × po_share (60/40).
const po=poLogMacros(R,1,true,0.6);
t('couple : part PO = recette × po_share (360 kcal)', po.kcal===360);

// Dérivation de la part Sarah depuis la part PO figée (jamais stockée).
const sa=sarahShareFromLog({for_two:true,po_share:0.6,...po});
t('part Sarah dérivée = base × (1-po_share) (240 kcal)', sa.kcal===240);
t('log solo → aucune part Sarah', sarahShareFromLog({for_two:false,po_share:1,...poLogMacros(R,1,false,1)})===null);

// GARDE-FOU (FLAG 2) : po_share hors ]0,1[ sur un repas pour deux → rejeté.
const throws=(fn)=>{try{fn();return false;}catch{return true;}};
t('GARDE-FOU : po_share=0 sur for_two → rejeté', throws(()=>assertCoupleShare(true,0)));
t('GARDE-FOU : po_share=1 sur for_two → rejeté', throws(()=>assertCoupleShare(true,1)));
t('solo : po_share≠1 → rejeté', throws(()=>assertCoupleShare(false,0.5)));
t('solo : po_share=1 → ok', assertCoupleShare(false,1)===1);

// Plan : total_portion fait autorité en couple (FLAG 1), portion_factor ignoré.
const pe=planEntryMacros({for_two:true,po_share:0.5,total_portion:2,portion_factor:1,recipe:R});
t('plan couple : PO = recette × total_portion × po_share (600)', pe.po.kcal===600);
t('plan couple : Sarah = recette × total_portion × (1-po_share) (600)', pe.sarah.kcal===600);
t('plan solo : PO = recette × portion_factor, Sarah null',
  planEntryMacros({for_two:false,portion_factor:1.5,recipe:R}).po.kcal===900
  && planEntryMacros({for_two:false,portion_factor:1.5,recipe:R}).sarah===null);

// Courses : plat ENTIER → couple compte total_portion (PO + Sarah).
const items=aggregateShoppingList([
  {for_two:true,total_portion:2,portion_factor:1,recipe:{ingredients:[{item:'Riz',qty:80,unit:'g'}]}},
  {for_two:false,portion_factor:1.5,recipe:{ingredients:[{item:'Riz',qty:40,unit:'g'}]}},
]);
t('courses : couple ×total_portion + solo ×portion_factor : 80×2 + 40×1.5 = 220 g',
  items.find(i=>i.item==='Riz')?.qty===220);

// % cibles Sarah + somme jour (seuls les for_two comptent).
t('pctOfTargets : 1025/2050 = 50%', pctOfTargets({kcal:1025,protein_g:0,carbs_g:0,fat_g:0},{kcal:2050,protein_g:1,carbs_g:1,fat_g:1}).kcal===50);
t('sarahDayTotals : ne somme que les for_two',
  sarahDayTotals([{for_two:true,po_share:0.6,...po},{for_two:false,po_share:1,...poLogMacros(R,1,false,1)}]).kcal===240);
process.exit(fail);
" || FAIL=1

echo "-- 3. Garde-fou EN BASE : CHECK (for_two, po_share) --"
cleanup
# meal_logs — cas REJETÉS (contrainte) et cas ACCEPTÉS.
C=$(post_code "meal_logs" "{\"log_date\":\"$TESTDATE\",\"slot\":\"diner\",\"free_label\":\"couple 0\",\"portion_factor\":1,\"for_two\":true,\"po_share\":0,\"kcal\":300,\"protein_g\":20,\"carbs_g\":30,\"fat_g\":10}")
[ "$C" -ge 400 ] && ok "meal_logs : for_two + po_share=0 REJETÉ ($C)" || ko "for_two po_share=0 accepté à tort ($C)"
C=$(post_code "meal_logs" "{\"log_date\":\"$TESTDATE\",\"slot\":\"diner\",\"free_label\":\"couple 1\",\"portion_factor\":1,\"for_two\":true,\"po_share\":1,\"kcal\":300,\"protein_g\":20,\"carbs_g\":30,\"fat_g\":10}")
[ "$C" -ge 400 ] && ok "meal_logs : for_two + po_share=1 REJETÉ ($C)" || ko "for_two po_share=1 accepté à tort ($C)"
C=$(post_code "meal_logs" "{\"log_date\":\"$TESTDATE\",\"slot\":\"diner\",\"free_label\":\"solo 0.5\",\"portion_factor\":1,\"for_two\":false,\"po_share\":0.5,\"kcal\":300,\"protein_g\":20,\"carbs_g\":30,\"fat_g\":10}")
[ "$C" -ge 400 ] && ok "meal_logs : solo + po_share≠1 REJETÉ ($C)" || ko "solo po_share=0.5 accepté à tort ($C)"
C=$(post_code "meal_logs" "{\"log_date\":\"$TESTDATE\",\"slot\":\"diner\",\"free_label\":\"couple 0.5\",\"portion_factor\":1,\"for_two\":true,\"po_share\":0.5,\"kcal\":300,\"protein_g\":20,\"carbs_g\":30,\"fat_g\":10}")
[ "$C" -ge 200 ] && [ "$C" -lt 300 ] && ok "meal_logs : for_two + po_share=0.5 ACCEPTÉ ($C)" || ko "for_two po_share=0.5 rejeté à tort ($C)"
C=$(post_code "meal_logs" "{\"log_date\":\"$TESTDATE\",\"slot\":\"dejeuner\",\"free_label\":\"solo defaut\",\"portion_factor\":1,\"kcal\":300,\"protein_g\":20,\"carbs_g\":30,\"fat_g\":10}")
[ "$C" -ge 200 ] && [ "$C" -lt 300 ] && ok "meal_logs : solo par défaut (for_two absent) ACCEPTÉ ($C) — zéro friction" || ko "solo par défaut rejeté ($C)"

# meal_plan_entries — même garde-fou.
RID=$(curl -sf "$REST/recipes?is_active=eq.true&select=id&limit=1" "${SRV[@]}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s)[0].id))")
C=$(post_code "meal_plan_entries" "{\"plan_date\":\"$TESTDATE\",\"slot\":\"diner\",\"recipe_id\":\"$RID\",\"portion_factor\":1,\"for_two\":true,\"po_share\":0,\"total_portion\":2}")
[ "$C" -ge 400 ] && ok "meal_plan_entries : for_two + po_share=0 REJETÉ ($C)" || ko "plan for_two po_share=0 accepté à tort ($C)"
C=$(post_code "meal_plan_entries" "{\"plan_date\":\"$TESTDATE\",\"slot\":\"diner\",\"recipe_id\":\"$RID\",\"portion_factor\":1,\"for_two\":true,\"po_share\":0.5,\"total_portion\":2}")
[ "$C" -ge 200 ] && [ "$C" -lt 300 ] && ok "meal_plan_entries : for_two + po_share=0.5 ACCEPTÉ ($C)" || ko "plan for_two po_share=0.5 rejeté à tort ($C)"
cleanup

echo "-- 4. Câblage : profil partenaire + tools MCP + solo par défaut --"
curl -sf "$REST/partner_profile?id=eq.1&select=name,kcal,is_active" "${SRV[@]}" | grep -q "Sarah" \
  && ok "partner_profile : singleton Sarah présent" || ko "partner_profile absent"
grep -q '"get_partner_profile"' src/app/api/\[transport\]/route.ts && grep -q '"update_partner_profile"' src/app/api/\[transport\]/route.ts \
  && ok "MCP : get/update_partner_profile enregistrés" || ko "tools partenaire non enregistrés"
grep -q "for_two boolean not null default false" supabase/migrations/20260709000003_partner_couple.sql \
  && ok "migration : for_two défaut false (solo = défaut, zéro friction)" || ko "défaut solo non garanti"
grep -q "is_active boolean not null default false" supabase/migrations/20260709000003_partner_couple.sql \
  && ok "migration : mode couple désactivé par défaut (opt-in)" || ko "opt-in couple non garanti"

if [ "$FAIL" -ne 0 ]; then
  echo "== Lot 11 : INCOMPLET =="
  exit 1
fi
echo "== Lot 11 : OK =="
