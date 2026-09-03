#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 23 (onglet 1 = Plan de la semaine) — exit != 0 sinon.
# 1. tsc + next build verts.
# 2. Routage : le Plan est l'accueil, le journal du jour vit sur /journal,
#    /plan redirige (raccourcis et liens existants préservés), et le squelette
#    partagé du groupe (tabs) reste à sa place — il sert TOUS les onglets.
# 3. Anti-orphelin : journal et réglages n'étaient atteignables que depuis
#    l'ancien onglet 1 ; ils doivent être réancrés dans l'en-tête du Plan.
# 4. Revalidations : les actions du journal invalident /journal, celles du plan
#    invalident l'accueil — sinon on sert une page périmée après une écriture.
# 5. DOM (scripts/e2e/lot23-dom.mjs) + audit complet des écrans
#    (scripts/e2e/audit.mjs) : chaque écran rend toujours ses éléments clés.
#
# Le journal N'EST PAS supprimé : c'est là qu'on relit et corrige ce que Claude
# encode par MCP. Il sort de la barre d'onglets, rien de plus.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3223
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

HOME_PAGE="src/app/(tabs)/page.tsx"
JOURNAL="src/app/(tabs)/journal/page.tsx"
PLAN_REDIR="src/app/(tabs)/plan/page.tsx"
NAV="src/components/bottom-nav.tsx"
DAYNAV="src/components/today/day-nav.tsx"
SWIPE="src/components/today/day-swipe.tsx"
TODAY_ACT="src/app/(tabs)/today-actions.ts"
PLAN_ACT="src/app/(tabs)/plan/plan-actions.ts"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 23 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Routage --"
grep -q "getWeekPlan" "$HOME_PAGE" && ok "l'accueil rend le plan de la semaine" || ko "l'accueil ne rend pas le plan"
[ -f "$JOURNAL" ] && grep -q "SlotSection" "$JOURNAL" && ok "journal conservé sur /journal (non supprimé)" || ko "journal perdu"
grep -q "redirect(week ? \`/?week=\${week}\` : \"/\")" "$PLAN_REDIR" && ok "/plan redirige en transmettant la semaine" || ko "/plan ne redirige pas"
[ -f "src/app/(tabs)/loading.tsx" ] && ok "squelette partagé du groupe (tabs) à sa place" || ko "squelette partagé déplacé : les autres onglets le perdraient"
grep -q '{ href: "/", label: "Plan"' "$NAV" && ok "onglet 1 = Plan" || ko "onglet 1 inchangé"
# L'ENTRÉE d'onglet, pas le mot : le commentaire du fichier explique justement
# pourquoi cet onglet a disparu.
grep -q "label: \"Aujourd'hui\"" "$NAV" && ko "l'onglet « Aujourd'hui » subsiste" || ok "onglet « Aujourd'hui » retiré"

echo "-- 3. Anti-orphelin : journal et réglages réancrés --"
grep -q 'href="/journal"' "$HOME_PAGE" && ok "accès au journal depuis l'accueil" || ko "journal orphelin"
grep -q 'href="/reglages"' "$HOME_PAGE" && ok "accès aux réglages depuis l'accueil" || ko "réglages orphelins"
grep -q 'href={`/journal?date=' "$DAYNAV" && ok "navigation jour du journal reste sur /journal" || ko "la nav jour renverrait vers le Plan"
grep -q 'router.push(`/journal?date=' "$SWIPE" && ok "swipe du journal reste sur /journal" || ko "le swipe renverrait vers le Plan"

echo "-- 4. Revalidations à jour --"
# Assertion POSITIVE : la version « A && !B && ko || ok » affichait OK dès que
# A manquait — y compris sur un fichier sans aucun revalidatePath.
grep -q 'revalidatePath("/journal");' "$TODAY_ACT" \
  && ok "les actions du journal invalident /journal" \
  || ko "les actions du journal n'invalident pas /journal"
# Les cibles alimentent AUSSI le Plan (accueil) : il doit être invalidé.
grep -q 'revalidatePath("/");' "$TODAY_ACT" \
  && ok "les cibles invalident aussi l'accueil (le Plan les consomme)" \
  || ko "l'accueil servirait des cibles périmées après édition"
grep -q 'revalidatePath("/journal");' "$PLAN_ACT" && ok "les actions du plan invalident aussi le journal" || ko "journal non invalidé par le plan"

echo "-- 5. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot23-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 6. DOM : accueil, onglets, accès réancrés, redirection --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot23-dom.mjs; then
  ok "DOM : Plan en accueil, journal et réglages atteignables, /plan redirige"
else
  ko "DOM (scripts/e2e/lot23-dom.mjs)"
fi

echo "-- 7. Audit : chaque écran rend toujours ses éléments clés --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/audit.mjs; then
  ok "audit complet des écrans"
else
  ko "audit (scripts/e2e/audit.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 23 : INCOMPLET =="; exit 1; fi
echo "== Lot 23 : OK =="
