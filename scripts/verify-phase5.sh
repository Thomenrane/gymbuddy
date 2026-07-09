#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Phase 5 (Tendances) — exit != 0 si incomplet.
# 1. tsc + next build verts
# 2. scripts/phase5-tests.mjs : les modules de calcul de la page
#    (src/lib/trends.mjs, src/lib/oily-fish.mjs) exécutés sur des données
#    de test insérées en base et relues comme l'app, comparés à des CALCULS
#    DE RÉFÉRENCE refaits en dur :
#    - moyenne hebdomadaire de poids (83.65 / 82.8)
#    - progression de charge ordonnée par date (insertion en désordre)
#    - moyennes kcal/protéines 7 jours (2100 / 150 sur 3 jours loggés)
#    - compteur poisson gras de la semaine (jeu de logs connu)
#    - séances par semaine par type
#    Nettoyage complet vérifié (pesées/repas 1999, workouts 2126, __P5*).
# 3. Les 6 visualisations du PRD §4 existent comme composants ET sont
#    rendues par la page /tendances (le build ci-dessus les compile).
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

echo "== Phase 5 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Calculs vs références indépendantes (données insérées puis nettoyées) --"
if NODE_USE_ENV_PROXY=1 node scripts/phase5-tests.mjs; then
  ok "modules tendances : 5 calculs conformes aux références"
else
  ko "tests tendances (scripts/phase5-tests.mjs)"
fi

echo "-- 3. Les 6 visualisations du PRD §4 (composants rendus) --"
PAGE="src/app/(tabs)/tendances/page.tsx"
declare -A VIZ=(
  ["WeightChart"]="src/components/trends/weight-chart.tsx"
  ["WaistChart"]="src/components/trends/waist-chart.tsx"
  ["ProgressionChart"]="src/components/trends/progression-chart.tsx"
  ["AveragesPanel"]="src/components/trends/averages-panel.tsx"
  ["OilyFishCounter"]="src/components/trends/oily-fish-counter.tsx"
  ["SessionsChart"]="src/components/trends/sessions-chart.tsx"
)
for comp in WeightChart WaistChart ProgressionChart AveragesPanel OilyFishCounter SessionsChart; do
  file="${VIZ[$comp]}"
  if [ -s "$file" ] && grep -q "<$comp" "$PAGE"; then
    ok "$comp : composant présent et rendu par /tendances"
  else
    ko "$comp manquant (fichier ou rendu dans la page)"
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "== Phase 5 : INCOMPLÈTE =="
  exit 1
fi
echo "== Phase 5 : OK =="
