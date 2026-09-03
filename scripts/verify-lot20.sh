#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 20 (exercice ajouté en séance = pré-rempli comme un
# exercice de template) — exit != 0 sinon.
# 1. tsc + next build verts.
# 2. Statique : une action LIT le contexte d'un exercice (dernière perf, cible,
#    consignes du template actif) et ne l'ÉCRIT jamais — la cible reste posée
#    par Claude via MCP (garde-fou du Lot 14, conservé).
# 3. Statique : la sheet d'ajout affiche un état de chargement et cherche sans
#    accents ; l'ancien chemin « 3 séries vides » reste le repli exact pour un
#    exercice créé à la volée.
# 4. DOM (scripts/e2e/lot20-dom.mjs) : exercice déjà fait → cases à l'objectif
#    + ligne « Dernière » + ⓘ ; exercice inconnu → 3 séries vides sans texte
#    trompeur ; recherche « elevation » → « Élévation ». Nettoyage.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3220
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

ACT="src/app/(tabs)/training/training-actions.ts"
SRV="src/lib/training-server.ts"
EDT="src/components/training/session-editor.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 20 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Lecture du contexte d'un exercice, jamais d'écriture de cible --"
grep -q "export async function getExercisePrefill" "$ACT" && ok "action getExercisePrefill" || ko "action absente"
grep -q "export async function getExerciseContext" "$SRV" && ok "lecture serveur : exercice + template actif + dernière perf" || ko "getExerciseContext absent"
grep -q "workout_templates!inner" "$SRV" && ok "consignes prises sur un template ACTIF" || ko "template inactif possible"
grep -q "localeCompare" "$SRV" && ok "choix déterministe quand plusieurs templates contiennent l'exo" || ko "choix non déterministe"
# Une ÉCRITURE de cible prend deux formes, et deux seulement :
#   - clé d'objet littéral NON précédée d'un point : « target_weight_kg: 80 »,
#     « { target_weight_kg } », « { target_weight_kg, … } », « "target_weight_kg": »
#   - affectation de propriété : « patch.target_weight_kg = 80 »
# Une LECTURE (« exercise.target_weight_kg », y compris suivie d'une virgule)
# n'est ni l'une ni l'autre. Effacer aveuglément tout ce qui suit un point —
# ce que faisait la version précédente — laissait passer les affectations.
target_write() {
  grep -qE "(^|[^.[:alnum:]_])target_weight_(kg|note)[[:space:]]*([:,}]|\")" "$@" && return 0
  grep -qE "target_weight_(kg|note)[[:space:]]*=[^=>]" "$@" && return 0
  return 1
}
if target_write "$ACT"; then
  ko "l'action écrit une cible (interdit — Claude only via MCP, garde-fou Lot 14)"
else
  ok "aucune écriture de cible dans les actions app (garde-fou Lot 14 intact)"
fi

echo "-- 3. Sheet d'ajout : chargement, accents, repli --"
grep -q "pendingId" "$EDT" && ok "état de chargement pendant la lecture du contexte" || ko "aucun état de chargement"
grep -q "aria-busy={pendingId != null}" "$EDT" && ok "liste marquée aria-busy" || ko "aria-busy absent"
grep -q "const searchKey" "$EDT" && ok "recherche insensible aux accents" || ko "recherche encore accent-sensible"
grep -q "getExercisePrefill(item.id).catch(() => null)" "$EDT" \
  && ok "échec de lecture → repli sur l'exercice vide (jamais de pick perdu)" \
  || ko "aucun repli en cas d'échec"
grep -q "if (!item.id)" "$EDT" && ok "exercice créé à la volée → 3 séries vides (comportement conservé)" || ko "repli création à la volée absent"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot20-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. DOM : ajout pré-rempli / exercice inconnu / recherche --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot20-dom.mjs; then
  ok "DOM : ajout pré-rempli à l'objectif + ligne « Dernière » (détail ci-dessus)"
else
  ko "DOM (scripts/e2e/lot20-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 20 : INCOMPLET =="; exit 1; fi
echo "== Lot 20 : OK =="
