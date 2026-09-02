#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 24 (confort en salle) — exit != 0 sinon.
# 1. tsc + next build verts.
# 2. Module de saisie/chrono PUR et testé (scripts/session-controls.test.mjs) :
#    les boutons ± n'inventent jamais de donnée (case vide décrémentée → vide,
#    jamais de négatif, pas de dérive flottante), compte à rebours en m:ss.
# 3. Statique : le chrono part de `rest_seconds` du template (jamais d'une
#    constante), l'échéance est absolue (un timer décrémenté dériverait en
#    arrière-plan), les ± ne s'affichent que sous la case active (la densité
#    gagnée au Lot 19 reste intacte), et le wake lock dégrade en silence.
# 4. DOM (scripts/e2e/lot24-dom.mjs) : ± contextuels et appliqués, chrono lancé
#    /décompté/arrêté, wakeLock disponible, enregistrement toujours bon.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3224
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

MOD="src/lib/session-controls.mjs"
TIMER="src/components/training/rest-timer.tsx"
LOCK="src/lib/use-wake-lock.ts"
EDT="src/components/training/session-editor.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 24 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Saisie et chrono : module pur et testé --"
if node scripts/session-controls.test.mjs; then
  ok "± sans donnée inventée, compte à rebours en m:ss"
else
  ko "tests du module (scripts/session-controls.test.mjs)"
fi
grep -qE "localStorage\.|from \"react\"" "$MOD" \
  && ko "le module de saisie touche au stockage/React (il doit rester pur)" \
  || ok "module pur"

echo "-- 3. Statique : chrono, ± contextuels, wake lock --"
grep -q "ex.rest != null && ex.rest > 0" "$EDT" && ok "chrono proposé seulement si le template pose un repos" || ko "chrono inconditionnel"
grep -q "endsAt: Date.now() + ex.rest! \* 1000" "$EDT" && ok "chrono lancé sur rest_seconds du template" || ko "durée codée en dur"
grep -q "endsAt - Date.now()" "$TIMER" && ok "échéance absolue (pas de dérive en arrière-plan)" || ko "compteur décrémenté : dériverait"
grep -q "navigator.vibrate" "$TIMER" && ok "vibration en fin de repos" || ko "aucune notification de fin"
grep -q "key={rest.endsAt}" "$EDT" && ok "chrono remonté à chaque repos (pas de setState en effet)" || ko "remontage absent"
grep -q "focused?.key === ex.key && focused.index === i" "$EDT" && ok "± affichés sous la SEULE case active" || ko "± affichés partout : densité perdue"
grep -q "onPointerDown={(e) => e.preventDefault()}" "$EDT" && ok "le focus survit au tap sur ± " || ko "le tap fermerait la ligne avant de s'appliquer"
grep -q 'useWakeLock(true)' "$EDT" && ok "écran maintenu allumé pendant la séance" || ko "wake lock non branché"
grep -q '"wakeLock" in navigator' "$LOCK" && ok "wake lock : absence d'API gérée" || ko "plantage si API absente"
grep -q 'visibilitychange' "$LOCK" && ok "wake lock repris au retour à l'écran" || ko "verrou perdu après un passage en arrière-plan"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot24-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. DOM : ±, chrono, wakeLock, enregistrement --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot24-dom.mjs; then
  ok "DOM : confort en salle (détail ci-dessus)"
else
  ko "DOM (scripts/e2e/lot24-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 24 : INCOMPLET =="; exit 1; fi
echo "== Lot 24 : OK =="
