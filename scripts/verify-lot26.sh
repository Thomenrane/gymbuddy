#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 26 (signe de la cible de poids) — exit != 0 sinon.
#
# Le Lot 14 imposait target_weight_kg > 0 : l'assistance était inexprimable et
# l'app devait DEVINER le signe depuis l'historique. Depuis le Lot 19 les cases
# sont pré-remplies à l'objectif, donc une cible « assistance 14 » arrivait
# comme +14 sous un en-tête « poids (kg) » — 14 kg lestés enregistrés pour une
# séance assistée, validables d'un tap. La cible est maintenant SIGNÉE, même
# convention que workout_sets.weight_kg (AMENDEMENT 3).
#
# 1. tsc + next build verts.
# 2. Module d'objectif : le signe vient de la CIBLE, plus d'un devinage
#    (scripts/session-target.test.mjs) ; aucun cas « magnitude connue,
#    convention inconnue » ne subsiste.
# 3. Service : le « > 0 » a disparu, et une cible POSITIVE sur un exercice dont
#    l'historique chargé est intégralement assisté est REFUSÉE (le garde-fou
#    qui empêche le bug de revenir). Prouvé par mutation.
# 4. Migration : documente la convention et ne retourne QUE les exercices sans
#    aucune série lestée (un exercice en transition assistance → lest garde son
#    positif).
# 5. Base cible : plus aucune cible positive sur un exercice assisté.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3226
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

# Le volet MCP du Lot 14 n'a jamais tourné pendant six lots parce qu'on croyait
# qu'il fallait le secret de production. C'est faux en local : le serveur est
# démarré par CE script et hérite de cet environnement, donc client et serveur
# partagent la même valeur — n'importe laquelle fait l'affaire. Le vrai secret
# n'est nécessaire que pour viser une cible distante.
if [ -z "${MCP_SECRET:-}" ]; then
  if [ -n "${BASE_URL:-}" ]; then
    echo "MCP_SECRET est requis pour viser une cible distante ($BASE_URL)." >&2
    exit 2
  fi
  MCP_SECRET="$(openssl rand -base64 32)"
  export MCP_SECRET
fi
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"
MCP_URL="${MCP_URL:-$RUN_BASE/api/mcp}"

cleanup() {
  # `npx next start` n'est qu'un LANCEUR : tuer $SERVER_PID laisse vivre le
  # process `next-server` enfant, qui garde le port. Le contrat suivant croit
  # démarrer son serveur, échoue silencieusement à se lier, et teste en réalité
  # le build périmé du serveur resté là — deux faux échecs (Lots 18 et 19) avant
  # qu'on remonte jusqu'ici. On tue donc les enfants ET ce qui tient le port.
  [ -n "${SERVER_PID:-}" ] && pkill -P "$SERVER_PID" 2>/dev/null || true
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  fuser -k "$PORT/tcp" 2>/dev/null || true
}
trap cleanup EXIT

MOD="src/lib/session-target.mjs"
SVC="src/lib/mcp/service.ts"
ROUTE="src/app/api/[transport]/route.ts"
MIG="supabase/migrations/20260903000001_target_weight_sign.sql"
SRV_HDR=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

echo "== Lot 26 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Objectif : le signe vient de la cible --"
if node scripts/session-target.test.mjs; then
  ok "objectif : cible signée, assistance, transitions (détail ci-dessus)"
else
  ko "tests du module d'objectif (scripts/session-target.test.mjs)"
fi
grep -qE 'localStorage\.|from "(@supabase/|@/lib/supabase|next/|react"|react/)' "$MOD" \
  && ko "le module d'objectif touche au stockage/React (il doit rester pur)" \
  || ok "module pur"
# Le devinage du signe était CE code-là : sans historique chargé, la charge
# était effacée (`signKnown` faux → weight null). Sa disparition est le cœur du
# lot : s'il revient, la case redevient vide alors que la cible dit tout.
grep -q "signKnown" "$MOD" && ko "le module devine encore le signe (signKnown)" \
  || ok "plus de devinage : le signe est porté par la cible"
grep -q "const signed = targetSigned ?? doneSigned;" "$MOD" \
  && ok "cible prioritaire sur l'historique, signe compris" || ko "la cible ne fait pas autorité"
grep -q "signed > doneSigned" "$MOD" \
  && ok "difficulté ordonnée par le poids signé (-14 < -12 < 0 < +5)" || ko "comparaison non signée : l'assistance s'inverse"

echo "-- 3. Service : négatif autorisé, positif sur exo assisté refusé --"
# Viser « Number(weight) > 0 » seul matcherait le NOUVEAU garde-fou de signe,
# qui teste légitimement la positivité avant de refuser ; viser le message
# « doit être un nombre > 0 » matcherait le validateur de macros (service.ts:99),
# sans rapport. On cible donc la condition COMPLÈTE de l'ancienne contrainte,
# qui n'appartient qu'à setExerciseTarget. Vérifié par mutation : réintroduire
# la contrainte rend bien cette ligne rouge.
grep -q "Number.isFinite(Number(weight)) && Number(weight) > 0" "$SVC" \
  && ko "l'ancienne contrainte « cible > 0 » est de retour (assistance inexprimable)" \
  || ok "la contrainte « > 0 » a disparu"
grep -q "Number(weight) !== 0" "$SVC" && ok "cible non nulle exigée (0 n'a pas de sens)" || ko "une cible 0 passerait"
grep -q "loaded.every((n) => n < 0)" "$SVC" \
  && ok "garde-fou : cible positive refusée sur un exercice assisté" || ko "garde-fou de signe absent"
grep -q "NÉGATIF = assistance" "$ROUTE" \
  && ok "l'outil MCP annonce la convention à Claude" || ko "Claude ne sait pas que le signe compte"

echo "-- 4. Migration : convention documentée, bascule bornée --"
grep -q "comment on column exercises.target_weight_kg" "$MIG" && ok "convention documentée en base" || ko "colonne non documentée"
grep -qE "alter table|drop |create table" "$MIG" && ko "la migration touche au schéma (elle ne doit que documenter et reprendre les données)" || ok "aucun changement de schéma"
grep -q "and not exists (" "$MIG" \
  && ok "un exercice avec des séries lestées n'est PAS retourné" || ko "bascule non bornée : un exo en transition serait inversé"

echo "-- 5. État de la base cible --"
# Une cible positive sur un exercice dont TOUTES les séries chargées sont
# assistées est exactement le bug du Lot 26 : il ne doit plus en exister.
REST=$(curl -s --get "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/exercises" \
  --data-urlencode "select=name,target_weight_kg,workout_sets(weight_kg)" \
  --data-urlencode "target_weight_kg=gt.0" "${SRV_HDR[@]}")
BAD=$(node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let rows; try { rows = JSON.parse(s); } catch { console.log("PARSE"); return; }
  if (!Array.isArray(rows)) { console.log("PARSE"); return; }
  const bad = rows.filter((e) => {
    const w = (e.workout_sets ?? []).map((x) => Number(x.weight_kg)).filter((n) => Number.isFinite(n) && n !== 0);
    return w.length > 0 && w.every((n) => n < 0);
  });
  console.log(bad.length ? bad.map((e) => `${e.name}=${e.target_weight_kg}`).join(",") : "0");
});' <<<"$REST")
if [ "$BAD" = "0" ]; then
  ok "aucune cible positive sur un exercice assisté"
elif [ "$BAD" = "PARSE" ]; then
  ko "lecture de la base impossible (réponse inattendue)"
else
  ko "cible positive sur exercice assisté : $BAD — appliquer $MIG"
fi

echo "-- 6. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot26-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 7. MCP : le garde-fou de signe REFUSE vraiment (bout en bout) --"
# Une assertion statique par grep ne prouve qu'une chose : que le grep réagit à
# la chaîne qu'il cherche. Ici l'outil MCP est appelé pour de vrai sur un
# exercice assisté DÉCOUVERT dans le catalogue, et le refus doit arriver.
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   MCP_URL="$MCP_URL" MCP_SECRET="$MCP_SECRET" node scripts/lot26-mcp-sign.mjs; then
  ok "MCP : positif refusé sur assisté, négatif accepté, cible restaurée"
else
  ko "MCP signe (scripts/lot26-mcp-sign.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 26 : INCOMPLET =="; exit 1; fi
echo "== Lot 26 : OK =="
