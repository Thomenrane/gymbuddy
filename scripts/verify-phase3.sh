#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Phase 3 (onglet Training) — exit != 0 si incomplet.
# 1. tsc + next build verts
# 2. scripts/phase3-tests.mjs (module de pré-remplissage RÉEL de l'app) :
#    - pré-remplissage Day 1 : dernier poids ET reps par exercise_id,
#      les baselines seedées ressortent (dont Pull-Ups assist. -9 kg)
#    - séance créée depuis le template : +1 set, poids modifié, exo du
#      catalogue ajouté → devient la nouvelle référence "dernière fois"
#    - running (pace calculé), padel, édition, suppression
#    - nettoyage complet, baselines intactes (3 workouts / 51 sets)
# Dates de test en 2126 (postérieures aux baselines, jamais réelles).
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquante}"

cleanup() {
  curl -s -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/workouts?workout_date=in.(2126-01-01,2126-01-02)" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -o /dev/null || true
}
trap cleanup EXIT

echo "== Phase 3 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Données (module de pré-remplissage de l'app) --"
if NODE_USE_ENV_PROXY=1 node scripts/phase3-tests.mjs; then
  ok "tests de données Phase 3"
else
  ko "tests de données Phase 3"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "== Phase 3 : INCOMPLÈTE =="
  exit 1
fi
echo "== Phase 3 : OK =="
