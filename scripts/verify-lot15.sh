#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 15 (accès fiche recette depuis la vue Plan) — exit != 0.
# 1. tsc + next build verts.
# 2. Réutilisation (statique) : la sheet du plan lie la fiche recette existante
#    (/recettes/[id]) via recipeHref — pas de nouveau composant de fiche.
# 3. Actions existantes intactes (portion, remplacer, retirer) + logique
#    portion/for_two non modifiée.
# 4. DOM : la sheet d'un repas planifié propose « Voir la recette » qui ouvre
#    la fiche (ingrédients + étapes), les actions existantes restent présentes,
#    et un retour préserve la semaine (scripts/e2e/lot15-dom.mjs).
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3215
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

PW="src/components/plan/plan-week.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  curl -s -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/meal_plan_entries?plan_date=eq.1999-11-08" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -o /dev/null || true
}
trap cleanup EXIT

echo "== Lot 15 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Réutilisation de la fiche existante (pas de duplication) --"
grep -q "Voir la recette" "$PW" && ok "action « Voir la recette » ajoutée à la sheet du plan" || ko "action absente"
grep -q "recipeHref" "$PW" && ok "réutilise recipeHref → /recettes/[id] (fiche existante)" || ko "recipeHref non utilisé"
# Aucun nouveau composant de fiche recette : la seule fiche reste la page existante.
if ls src/components/**/recipe-detail* src/components/**/recipe-view* 2>/dev/null | grep -q .; then
  ko "un composant de fiche recette dupliqué a été créé (interdit)"
else
  ok "aucun composant de fiche dupliqué (fiche = page /recettes/[id] existante)"
fi

echo "-- 3. Actions existantes + logique portion/for_two intactes --"
grep -q "Remplacer par une autre recette" "$PW" && ok "action « Remplacer » présente" || ko "« Remplacer » disparue"
grep -q "Retirer du plan" "$PW" && ok "action « Retirer du plan » présente" || ko "« Retirer » disparue"
grep -q "updatePlanEntry(entry.id, f, forTwo)" "$PW" && ok "réglage de portion (for_two) inchangé" || ko "logique portion modifiée"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot15-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. DOM : Plan → fiche recette + actions intactes + retour semaine --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot15-dom.mjs; then
  ok "DOM : « Voir la recette » ouvre la fiche, actions OK, semaine préservée"
else
  ko "DOM (scripts/e2e/lot15-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 15 : INCOMPLET =="; exit 1; fi
echo "== Lot 15 : OK =="
