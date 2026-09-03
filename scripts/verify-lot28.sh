#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 28 (scan sur l'accueil, « Ouvrir le jour » retiré)
# — exit != 0 sinon.
#
# 1. tsc + next build verts.
# 2. Statique : le scan est monté sur l'accueil avec une VRAIE date (pas une
#    constante), « Ouvrir le jour » a disparu de l'onglet Training, et la route
#    /training/day garde ses appelants — elle n'est pas morte, c'est le retour
#    après enregistrement/modification/suppression d'une séance.
# 3. Pas de code mort : l'icône du lien retiré ne reste pas importée.
# 4. DOM (scripts/e2e/lot28-dom.mjs) : le bouton ouvre le scanner sur l'accueil,
#    « Ouvrir le jour » est absent, /training/day répond encore, et la page
#    Recettes ne se présente plus comme un scanner sans perdre son lien.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3228
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

HOME_PAGE="src/app/(tabs)/page.tsx"
TRAIN="src/app/(tabs)/training/page.tsx"
RECETTES="src/app/(tabs)/recettes/page.tsx"
BTN="src/components/plan/scan-button.tsx"
DAY="src/app/(tabs)/training/day/[date]/page.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  # `npx next start` n'est qu'un LANCEUR : tuer $SERVER_PID laisse vivre le
  # process `next-server` enfant, qui garde le port. Le contrat suivant croit
  # démarrer son serveur, échoue silencieusement à se lier, et teste en réalité
  # le build périmé du serveur resté là — deux faux échecs (Lots 18 et 19) avant
  # qu'on remonte jusqu'ici. On tue donc les enfants ET ce qui tient le port.
  [ -n "${SERVER_PID:-}" ] && pkill -P "$SERVER_PID" 2>/dev/null || true
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== Lot 28 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Statique : scan sur l'accueil, jour retiré --"
grep -q "<PlanScanButton date={today} />" "$HOME_PAGE" \
  && ok "scan monté sur l'accueil, sur la date réelle du jour" || ko "scan absent de l'accueil (ou date en dur)"
grep -q 'slot="extra"' "$BTN" \
  && ok "créneau « extra » : le scan ne présume pas du repas" || ko "créneau présumé"
grep -q '"use client"' "$BTN" && ok "bouton client (la feuille a un état)" || ko "bouton non client"
# Chercher le TEXTE « Ouvrir le jour » matcherait le commentaire qui explique
# son retrait — exactement ce que verify-lot25 faisait avec « security invoker ».
# On vise le lien lui-même : un href vers la vue jour du jour SÉLECTIONNÉ n'a
# qu'un seul sens, et aucun commentaire ne l'écrit.
grep -qF 'href={`/training/day/${selectedDate}`}' "$TRAIN" \
  && ko "le lien « Ouvrir le jour » est encore rendu" || ok "lien « Ouvrir le jour » retiré"

# La route jour n'est PAS morte : c'est le retour après enregistrement,
# modification et suppression. Retirer le bouton ne doit pas la supprimer, et
# ce contrat échoue si quelqu'un s'en débarrasse en croyant nettoyer.
[ -f "$DAY" ] && ok "la route /training/day existe toujours" || ko "route /training/day supprimée : les retours après enregistrement cassent"
CALLERS=$(grep -rl "training/day" src/ | wc -l)
if [ "$CALLERS" -ge 4 ]; then
  ok "route jour toujours référencée ($CALLERS fichiers : retours après action)"
else
  ko "seulement $CALLERS référence(s) à /training/day — la route devient orpheline"
fi

echo "-- 3. Pas de code mort laissé derrière --"
grep -q "ArrowSquareOut" "$TRAIN" && ko "icône du lien retiré encore importée" || ok "import de l'icône nettoyé"
grep -qi "scan de produits" "$RECETTES" && ko "Recettes se présente encore comme un scanner" || ok "Recettes ne revendique plus le scan"
grep -q "/recettes/ingredients" "$RECETTES" \
  && ok "la référence ingrédients garde sa porte d'entrée" || ko "page ingrédients orpheline"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot28-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. DOM : scan, jour, recettes --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot28-dom.mjs; then
  ok "DOM : scan à un tap, jour retiré, route jour vivante"
else
  ko "DOM (scripts/e2e/lot28-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 28 : INCOMPLET =="; exit 1; fi
echo "== Lot 28 : OK =="
