#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 10 (pesée + accès recette + swipe) — exit != 0.
# 1. tsc + next build verts
# 2. Logique partagée (src/lib/day-nav.mjs) — module utilisé par les
#    chevrons ET le swipe : dayNavTargets (prev/next, pas de futur) +
#    recipeHref (lien recette / null pour log libre).
# 3. Câblage : DaySwipe et DayNav utilisent tous deux dayNavTargets ;
#    DaySwipe a bien des handlers tactiles ; Sheet est [data-noswipe].
# 4. Rendu AUTHENTIFIÉ RÉEL de l'écran Aujourd'hui (scripts/lot10-render.mjs) :
#    widget de pesée présent dans le DOM (comble le trou de couverture du
#    verify-phase2), accès recette exposé pour un log recette et pas pour
#    un log libre, upsert body_metric (2 saisies = 1 ligne). Nettoyage.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3211
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquante (env)}"

REST="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
SRV=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  curl -s -X DELETE "$REST/meal_logs?log_date=eq.1999-10-11" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/body_metrics?metric_date=eq.1999-10-11" "${SRV[@]}" -o /dev/null || true
}
trap cleanup EXIT

echo "== Lot 10 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Logique partagée jour + recette (module pur) --"
node --input-type=module -e "
import { dayNavTargets, recipeHref } from './src/lib/day-nav.mjs';
let fail = 0;
const t = (l, c) => { console.log(\`  \${c?'OK  ':'FAIL'} \${l}\`); if(!c) fail=1; };
const mid = dayNavTargets('1999-10-11', '1999-10-15');
t('dayNavTargets milieu de semaine : prev=10, next=12', mid.prev==='1999-10-10' && mid.next==='1999-10-12');
const at = dayNavTargets('1999-10-15', '1999-10-15');
t('dayNavTargets à aujourd hui : next=null (pas de futur)', at.prev==='1999-10-14' && at.next===null);
const fut = dayNavTargets('1999-10-20', '1999-10-15');
t('dayNavTargets au-delà : next reste null', fut.next===null);
t('recipeHref log recette → /recettes/<id>', recipeHref({recipe_id:'abc-123'})==='/recettes/abc-123');
t('recipeHref log libre → null', recipeHref({recipe_id:null})===null);
process.exit(fail);
" || FAIL=1

echo "-- 3. Câblage swipe/chevrons (même logique) --"
grep -q "dayNavTargets" src/components/today/day-swipe.tsx && grep -q "onTouchStart" src/components/today/day-swipe.tsx && grep -q "onTouchEnd" src/components/today/day-swipe.tsx \
  && ok "DaySwipe : handlers tactiles + dayNavTargets (même logique que les chevrons)" \
  || ko "DaySwipe : câblage manquant"
grep -q "dayNavTargets" src/components/today/day-nav.tsx \
  && ok "DayNav (chevrons) utilise dayNavTargets" || ko "DayNav n'utilise pas dayNavTargets"
grep -q "data-noswipe" src/components/ui/sheet.tsx \
  && ok "Sheet marquée [data-noswipe] (pas de conflit swipe/sheet)" || ko "Sheet sans data-noswipe"
grep -q "Voir la recette" src/components/today/meal-log-row.tsx \
  && ok "Sheet d'édition : lien « Voir la recette » présent" || ko "lien recette absent de la sheet"

echo "-- 4. Serveur local + rendu authentifié réel --"
pkill -f "next start -p $PORT" 2>/dev/null || true
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot10-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done
ok "next start prêt (port $PORT)"

if NODE_USE_ENV_PROXY=1 BASE_URL="http://localhost:$PORT" node scripts/lot10-render.mjs; then
  ok "rendu authentifié : widget pesée + accès recette + upsert"
else
  ko "rendu authentifié (scripts/lot10-render.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "== Lot 10 : INCOMPLET =="
  exit 1
fi
echo "== Lot 10 : OK =="
