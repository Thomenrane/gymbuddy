#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 19 (densité de l'écran séance + objectif dans les
# cases) — exit != 0 sinon.
# 1. tsc + next build verts.
# 2. Module d'objectif PUR et testé (scripts/session-target.test.mjs) :
#    assemblage template + cible Claude + dernière perf, jamais d'extrapolation.
#    Aucun accès DB ni React dans src/lib/session-target.mjs.
# 3. Statique : les deux bandeaux d'aide ont quitté le flux, la ligne de
#    contexte est « Dernière », l'objectif est pré-rempli dans les cases,
#    la colonne RPE est conditionnelle.
# 4. DOM (scripts/e2e/lot19-dom.mjs) : sur un seed déterministe (cible 67,5 +
#    template 4×4-6 + historique 3×6 @ 67,5), les cases valent 4×6 @ 67.5, la
#    carte n'a QU'UNE ligne de texte, le ⓘ rend l'objectif/la fourchette/le
#    RPE/le repos/les notes, et la séance s'enregistre. Nettoyage.
# 5. Non-régression des contrats révisés par ce lot : le RPE par série
#    (Lot 12) et la cible de poids (Lot 14) restent prouvés à leur NOUVEL
#    emplacement — repliés, pas supprimés.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3219
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

MOD="src/lib/session-target.mjs"
EDT="src/components/training/session-editor.tsx"
PAGE="src/app/(tabs)/training/muscu/page.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 19 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Module d'objectif : pur et testé --"
if node scripts/session-target.test.mjs; then
  ok "objectif assemblé : double progression, assistance, capage, cas dégradés"
else
  ko "tests du module d'objectif (scripts/session-target.test.mjs)"
fi
grep -qE "from \"(@/lib/)?supabase|next/|react" "$MOD" \
  && ko "le module d'objectif importe la DB/React (il doit rester pur)" \
  || ok "module pur (aucun import DB/React)"
grep -q "export function sessionTarget" "$MOD" && ok "sessionTarget exporté" || ko "sessionTarget absent"
grep -q "export function targetRows" "$MOD" && ok "targetRows exporté (pré-remplissage)" || ko "targetRows absent"

echo "-- 3. Statique : le flux ne garde qu'une ligne de contexte --"
grep -q "Rappel : double progression" "$EDT" \
  && ko "le bandeau « double progression » est encore dans l'écran séance" \
  || ok "bandeau « double progression » sorti du flux"
grep -qE "^\s+<span>Échelle RPE" "$EDT" \
  && ko "le bandeau « Échelle RPE » est encore dans le flux" \
  || ok "bandeau « Échelle RPE » sorti du flux"
grep -q "Aide : double progression, RPE, affichage" "$EDT" && ok "aide regroupée derrière un « ? »" || ko "bouton d'aide absent"
grep -q "Dernière :" "$EDT" && ok "ligne de contexte « Dernière »" || ko "ligne « Dernière » absente"
grep -q "Dernière fois :" "$EDT" && ko "l'ancien libellé « Dernière fois » subsiste" || ok "ancien libellé supprimé"
grep -q "objectif et consignes" "$EDT" && ok "détail par exercice derrière un ⓘ" || ko "ⓘ absent"
grep -q "Objectif : {ex.targetLabel}" "$EDT" && ok "objectif retrouvable dans le ⓘ" || ko "objectif absent du ⓘ"
grep -q "rpeVisible &&" "$EDT" && ok "colonne RPE conditionnelle" || ko "colonne RPE toujours affichée"
grep -q "s.rpe.trim() !== \"\"" "$EDT" && ok "un RPE déjà saisi force l'affichage (rien n'est masqué)" || ko "un RPE saisi pourrait être masqué"
grep -q "targetRows(target)" "$PAGE" && ok "les cases sont pré-remplies à l'objectif" || ko "pré-remplissage encore basé sur la dernière perf"
grep -q "formatTarget(target)" "$PAGE" && ok "libellé d'objectif transmis à l'éditeur" || ko "targetLabel absent"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot19-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. DOM : densité + objectif dans les cases --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot19-dom.mjs; then
  ok "DOM : une ligne de contexte, cases à l'objectif, ⓘ complet (détail ci-dessus)"
else
  ko "DOM (scripts/e2e/lot19-dom.mjs)"
fi

echo "-- 6. Non-régression des contrats révisés (Lots 12 et 14) --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot12-dom.mjs; then
  ok "Lot 12 : le RPE par série existe toujours et ne bloque jamais"
else
  ko "Lot 12 cassé par le Lot 19 (scripts/e2e/lot12-dom.mjs)"
fi
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot14-dom.mjs; then
  ok "Lot 14 : la cible reste posée, affichée et distincte du dernier fait"
else
  ko "Lot 14 cassé par le Lot 19 (scripts/e2e/lot14-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 19 : INCOMPLET =="; exit 1; fi
echo "== Lot 19 : OK =="
