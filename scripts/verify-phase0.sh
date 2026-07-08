#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Phase 0 — échoue (exit != 0) si la phase est incomplète.
# Vérifie : tsc, next build, manifest PWA présent + référencé dans le build,
# schéma Supabase appliqué (9 tables + RLS), comptages du seed :
#   recipes == 32, workout_templates == 3, exercises >= 13,
#   3 workouts baseline dont les 51 sets portent les poids de départ
#   (44 avec charge, 7 au poids du corps — Chin-Ups & Bulgarian Split Squats).
# Requiert : NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
# (env ou .env.local). Les comptages passent par la RPC verify_phase0()
# (SECURITY DEFINER, lecture seule) — pas besoin de la clé service_role.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0
check() { # check <libellé> <commande…>
  if "${@:2}" >/dev/null 2>&1; then
    echo "  OK   $1"
  else
    echo "  FAIL $1"
    FAIL=1
  fi
}

echo "== Phase 0 — vérification mécanique =="

# --- Env ---
if [ -f .env.local ]; then
  set -a; source .env.local; set +a
fi
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquante}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY manquante}"

# --- 1. Typecheck + build ---
echo "-- Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

# --- 2. Manifest PWA présent + référencé ---
echo "-- PWA --"
check "src/app/manifest.ts présent" test -f src/app/manifest.ts
check "manifest.webmanifest dans le build" \
  grep -q "manifest.webmanifest" .next/app-path-routes-manifest.json
check "icône 192" test -f public/icons/icon-192.png
check "icône 512" test -f public/icons/icon-512.png

# --- 3. Routes du shell dans le build ---
echo "-- Routes --"
for route in "/login" "/training" "/recettes" "/tendances" "/auth/confirm"; do
  check "route $route" grep -q "\"$route\"" .next/app-path-routes-manifest.json
done

# --- 4. Schéma + seed Supabase (RPC lecture seule) ---
echo "-- Supabase --"
RESULT=$(curl -sf -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/verify_phase0" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{}')
echo "  verify_phase0() -> $RESULT"

set +e
node - "$RESULT" <<'EOF'
const d = JSON.parse(process.argv[2]);
const expectTables = ["body_metrics","exercises","meal_logs","recipes","targets",
  "template_exercises","workout_sets","workout_templates","workouts"];
const checks = [
  ["9 tables du PRD §3 présentes", expectTables.every(t => d.tables.includes(t))],
  ["RLS activé sur les 9 tables", d.rls_enabled_count === 9],
  ["recipes == 32", d.recipes === 32],
  ["workout_templates == 3", d.workout_templates === 3],
  ["exercises >= 13", d.exercises >= 13],
  ["template_exercises == 15", d.template_exercises === 15],
  ["3 workouts baseline", d.baseline_workouts === 3],
  ["51 sets baseline", d.baseline_sets_total === 51],
  ["44 sets avec poids de départ", d.baseline_sets_with_weight === 44],
  ["targets.kcal == 2270", d.targets_kcal === 2270],
];
let fail = 0;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}`);
  if (!ok) fail = 1;
}
process.exit(fail);
EOF
DB_FAIL=$?
set -e

if [ "$FAIL" -ne 0 ] || [ "$DB_FAIL" -ne 0 ]; then
  echo "== Phase 0 : INCOMPLÈTE =="
  exit 1
fi
echo "== Phase 0 : OK =="
