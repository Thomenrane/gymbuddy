#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 16 (scan code-barres → référence ingrédients) — exit != 0.
# 1. tsc + next build verts + test du module pur off-product (mapping OFF,
#    kJ→kcal, champs manquants listés, validation EAN, portion pesée).
# 2. Migration : source 'off' autorisée + colonne ean (traçabilité).
# 3. Route /api/barcode/[ean] : validation EAN, User-Agent OFF, cache,
#    réponse réduite via mapOffProduct ; protégée par le proxy (session).
# 4. Action addScannedIngredient : upsert (item, basis), source=off,
#    verified = fiche complète (macros manquantes → curation).
# 5. UI : mode scan dans la sheet d'ajout — BarcodeDetector natif, repli
#    @zxing/browser (chargé à la demande), saisie manuelle toujours possible.
# 6. DOM : EAN saisi → fiche OFF → nutrition_ref (source=off, verified) +
#    log d'une portion pesée aux macros étiquette (scripts/e2e/lot16-dom.mjs).
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3216
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

MIG="supabase/migrations/20260713000002_nutrition_ref_off.sql"
MOD="src/lib/off-product.mjs"
RTE="src/app/api/barcode/[ean]/route.ts"
ACT="src/app/(tabs)/today-actions.ts"
CMP="src/components/today/barcode-scan.tsx"
ADD="src/components/today/add-log.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 16 — vérification mécanique =="

echo "-- 1. Build + module pur --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build
check "test off-product (mapping, kJ→kcal, missing, EAN, portion)" node scripts/off-product.test.mjs

echo "-- 2. Migration (source off + ean) --"
grep -q "'off'" "$MIG" && ok "source 'off' autorisée par le check" || ko "source 'off' absente de la migration"
grep -q "add column if not exists ean" "$MIG" && ok "colonne ean (traçabilité du scan)" || ko "colonne ean absente"

echo "-- 3. Route /api/barcode/[ean] --"
grep -q "isValidBarcode" "$RTE" && ok "validation EAN avant l'appel OFF" || ko "pas de validation EAN"
grep -q "User-Agent" "$RTE" && ok "User-Agent identifiant (exigence OFF)" || ko "User-Agent absent"
grep -q "revalidate" "$RTE" && ok "cache des fiches (revalidate)" || ko "pas de cache"
grep -q "mapOffProduct" "$RTE" && ok "réponse réduite via mapOffProduct (jamais la fiche brute)" || ko "fiche brute renvoyée"
grep -q "api/barcode" src/proxy.ts && ko "/api/barcode exclu du proxy (doit rester protégé)" \
  || ok "route protégée par le proxy (session requise)"

echo "-- 4. Action serveur (référence ingrédients) --"
grep -q "addScannedIngredient" "$ACT" && ok "action addScannedIngredient" || ko "action absente"
grep -q 'onConflict: "item,basis"' "$ACT" && ok "upsert (item, basis) — re-scan = mise à jour" || ko "pas d'upsert (item, basis)"
grep -q 'source: "off"' "$ACT" && ok "source=off (traçabilité)" || ko "source off absente"
grep -Eq 'verified = p !== null && g !== null && l !== null' "$ACT" \
  && ok "verified = fiche complète (sinon curation)" || ko "logique verified absente"

echo "-- 5. UI scan --"
grep -q '"scan"' "$ADD" && grep -q "BarcodeScan" "$ADD" && ok "mode scan branché dans la sheet d'ajout" || ko "mode scan non branché"
grep -q "BarcodeDetector" "$CMP" && ok "BarcodeDetector natif (Chrome/Android)" || ko "BarcodeDetector absent"
grep -q '@zxing/browser' "$CMP" && grep -q 'import("@zxing/browser")' "$CMP" \
  && ok "repli @zxing/browser chargé à la demande (Safari/iOS)" || ko "repli zxing absent ou chargé statiquement"
grep -q 'aria-label="Code-barres"' "$CMP" && ok "saisie manuelle du code toujours possible" || ko "saisie manuelle absente"
grep -q "missing" "$CMP" && ok "macros manquantes signalées (jamais à zéro en silence)" || ko "missing non signalé"

echo "-- 6. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot16-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 7. DOM : scan (saisie manuelle) → référence + log portion --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot16-dom.mjs; then
  ok "DOM : fiche OFF → nutrition_ref (source=off) + portion pesée loggée"
else
  ko "DOM (scripts/e2e/lot16-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 16 : INCOMPLET =="; exit 1; fi
echo "== Lot 16 : OK =="
