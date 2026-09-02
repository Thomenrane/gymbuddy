#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 22 (reprendre une séance en cours) — exit != 0 sinon.
# (Numéroté 22 : verify-lot21.sh est déjà pris par le Lot 2.1.)
# 1. tsc + next build verts.
# 2. Module de brouillon PUR et testé (scripts/session-draft.test.mjs) :
#    progression sur les séries TOUCHÉES, brouillon fantôme non reprenable,
#    purge à 24 h, liens de reprise.
# 3. Statique : le brouillon n'est plus écrit au montage (drapeau `dirty`),
#    l'index est unique, le nettoyage a lieu à l'enregistrement comme à
#    l'abandon, et l'indicateur est rendu côté client (aucun décalage
#    d'hydratation).
# 4. DOM (scripts/e2e/lot22-dom.mjs) : ouvrir puis repartir ne crée rien ;
#    saisir puis quitter affiche « Reprendre » avec la progression ; la reprise
#    restaure la saisie ; abandon et enregistrement effacent le brouillon.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3222
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

MOD="src/lib/session-draft.mjs"
STORE="src/lib/session-drafts-store.ts"
EDT="src/components/training/session-editor.tsx"
CARD="src/components/training/resume-card.tsx"
PAGE="src/app/(tabs)/training/page.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 22 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Module de brouillon : pur et testé --"
if node scripts/session-draft.test.mjs; then
  ok "brouillons : progression, fantôme, purge, liens de reprise"
else
  ko "tests du module de brouillon (scripts/session-draft.test.mjs)"
fi
# Accès RÉEL au stockage (« localStorage. ») : le mot seul apparaît dans les
# commentaires du module, qui expliquent justement pourquoi il n'y touche pas.
grep -qE 'localStorage\.|from "(@supabase/|@/lib/supabase|next/|react"|react/)' "$MOD" \
  && ko "le module de brouillon touche au stockage/React (il doit rester pur)" \
  || ok "module pur (stockage isolé dans le store)"

echo "-- 3. Statique : plus de brouillon fantôme --"
grep -q "const dirty = useRef(false)" "$EDT" && ok "drapeau de saisie réelle" || ko "aucun drapeau : le brouillon serait encore écrit au montage"
grep -q "if (!dirty.current) return;" "$EDT" && ok "écriture conditionnée à une vraie saisie" || ko "écriture inconditionnelle"
grep -q "dirty.current = true;" "$EDT" && ok "les mutations volontaires arment le brouillon" || ko "aucune mutation n'arme le brouillon"
grep -q "touched: true" "$EDT" && ok "les séries saisies sont marquées (progression)" || ko "progression impossible à calculer"
grep -q "forgetDraft();" "$EDT" && ok "brouillon effacé (enregistrement et réinitialisation)" || ko "brouillon jamais effacé"
# Assertion par DÉNOMBREMENT plutôt que par orthographe : le seul setItem admis
# dans l'éditeur est la préférence de colonne RPE. Chercher « setItem(draftKey »
# laissait passer « setItem(key, …) » ou un littéral « gb-session-… ».
SETITEMS=$(grep -c "localStorage.setItem" "$EDT")
if [ "$SETITEMS" = "1" ] && grep -q "localStorage.setItem(RPE_COL_KEY" "$EDT"; then
  ok "brouillons écrits via l'index unique (seul setItem : la préférence RPE)"
else
  ko "setItem inattendu dans l'éditeur ($SETITEMS) : un brouillon pourrait échapper à l'index"
fi
grep -q "DRAFTS_KEY" "$STORE" && ok "index unique gb-drafts" || ko "index absent"
grep -q "if (Object.keys(next).length !== Object.keys(current).length) write(next);" "$STORE" \
  && ok "purge sans écriture inutile (pas de boucle de rendu)" || ko "purge potentiellement bouclante"
grep -q '"use client"' "$CARD" && ok "indicateur rendu côté client" || ko "indicateur non client"
grep -q "getServer: () => EMPTY" "$STORE" && ok "rendu serveur vide (aucun décalage d'hydratation)" || ko "snapshot serveur absent"
grep -q "<ResumeCard today={today} />" "$PAGE" && ok "indicateur monté dans l'onglet Training" || ko "indicateur non monté"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot22-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. DOM : fantôme, reprise, abandon, enregistrement --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot22-dom.mjs; then
  ok "DOM : indicateur « Reprendre » fidèle au cycle de vie du brouillon"
else
  ko "DOM (scripts/e2e/lot22-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 22 : INCOMPLET =="; exit 1; fi
echo "== Lot 22 : OK =="
