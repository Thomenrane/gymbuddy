#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 17 (produit scanné ↔ recettes) — exit != 0.
# 1. tsc + next build verts (le test off-product reste couvert par lot 16).
# 2. Actions : association (référence + renommage par nom), propagation
#    explicite, alignement des macros (refusé si ingrédient non référencé),
#    suppression d'une entrée de référence (seed protégé).
# 3. UI : page /recettes/ingredients (scannés d'abord, seed replié, scan
#    direct), lien depuis l'onglet Recettes, verdict recomposé + association
#    par ligne sur la fiche recette. Le scanner est RÉUTILISÉ
#    (ProductScanner/ProductInfo exportés) — pas de duplication caméra.
# 4. DOM : scan → référence → suppression ; association + propagation à
#    l'autre recette ; alignement des macros (scripts/e2e/lot17-dom.mjs).
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3217
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

ACT="src/app/(tabs)/recettes/actions.ts"
SCAN="src/components/today/barcode-scan.tsx"
REFS="src/components/recipes/ingredient-refs.tsx"
ASSOC="src/components/recipes/ingredient-associate.tsx"
CHECKC="src/components/recipes/recipe-check.tsx"
FICHE="src/app/(tabs)/recettes/[id]/page.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 17 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Actions serveur --"
grep -q "associateScannedIngredient" "$ACT" && ok "association : référence + renommage par nom" || ko "associateScannedIngredient absente"
grep -q "propagateIngredientRename" "$ACT" && ok "propagation explicite aux autres recettes" || ko "propagation absente"
grep -q "unknown.length > 0" "$ACT" && ok "alignement refusé si ingrédient non référencé" || ko "alignement sans garde-fou"
grep -q '"Le seed CIQUAL ne se supprime pas' "$ACT" && ok "suppression : seed CIQUAL protégé" || ko "seed supprimable (interdit)"

echo "-- 3. UI --"
test -f "src/app/(tabs)/recettes/ingredients/page.tsx" && ok "page /recettes/ingredients" || ko "page ingredients absente"
grep -q "recettes/ingredients" "src/app/(tabs)/recettes/page.tsx" && ok "lien depuis l'onglet Recettes" || ko "lien absent"
grep -q "RecipeCheck" "$FICHE" && grep -q "IngredientAssociate" "$FICHE" && ok "fiche : verdict recomposé + association par ligne" || ko "fiche non branchée"
grep -q "export function ProductScanner" "$SCAN" && grep -q "ProductScanner" "$REFS" && grep -q "ProductScanner" "$ASSOC" \
  && ok "scanner réutilisé (ProductScanner exporté, pas de duplication caméra)" || ko "scanner dupliqué ou non réutilisé"
grep -q "Aligner les macros" "$CHECKC" && ok "alignement = bouton explicite" || ko "bouton d'alignement absent"
grep -q "logs passés" "$CHECKC" || grep -q "figées" "$CHECKC" && ok "règle PRD rappelée (logs passés figés)" || ko "mention logs figés absente"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot17-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. DOM : référence + association + propagation + alignement --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot17-dom.mjs; then
  ok "DOM : scan → référence → association → propagation → alignement"
else
  ko "DOM (scripts/e2e/lot17-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 17 : INCOMPLET =="; exit 1; fi
echo "== Lot 17 : OK =="
