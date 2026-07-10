#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 12 (RPE optionnel par série) — exit != 0 sinon.
# 1. tsc + next build verts.
# 2. Migration non cassante : workout_sets.rpe (numeric null) ajouté ; les 51
#    séries baseline restent lisibles avec rpe = null (aucune perte).
# 3. MCP (HTTP bearer) : log_workout stocke un rpe (8.5) ET accepte un set sans
#    rpe (null) ; get_workouts + get_exercise_history renvoient le rpe ;
#    update_workout (remplacement) préserve le rpe. (scripts/lot12-mcp-rpe.mjs)
# 4. DOM : l'écran séance rendu expose un champ RPE optionnel par série qui NE
#    bloque PAS la validation quand il est vide (scripts/e2e/lot12-dom.mjs).
# 5. Garde-fous : perceived_intensity global inchangé ; aucun RPE obligatoire.
#
# Local (CI) : démarre un serveur local. Distant : exporter BASE_URL=<url>
# (ex. preview Vercel) → le serveur local n'est pas démarré, MCP+DOM ciblent
# l'URL distante. tsc+build et les checks REST tournent dans tous les cas.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3212
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"
: "${MCP_SECRET:?manquante (env)}"

REST="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
SRV=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
NOTE_ENC="baseline%20seed%20%E2%80%94%20poids%20de%20d%C3%A9part"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"
MCP_URL="${MCP_URL:-$RUN_BASE/api/mcp}"

crange() { curl -s "$1" "${SRV[@]}" -H "Prefer: count=exact" -I 2>/dev/null | tr -d '\r' | sed -n 's/.*content-range: [0-9-]*\///Ip'; }

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  curl -s -X DELETE "$REST/workouts?workout_date=eq.1999-12-13" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/workouts?workout_date=eq.1999-12-14" "${SRV[@]}" -o /dev/null || true
  curl -s -X DELETE "$REST/exercises?name=eq.__RPE_TEST_EXO__" "${SRV[@]}" -o /dev/null || true
}
trap cleanup EXIT

echo "== Lot 12 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Migration non cassante (workout_sets.rpe) --"
RPE_COL=$(curl -s -o /dev/null -w "%{http_code}" "$REST/workout_sets?select=rpe&limit=1" "${SRV[@]}")
[ "$RPE_COL" = "200" ] && ok "colonne rpe présente (select=rpe → 200)" || ko "colonne rpe absente ($RPE_COL)"
BASE_SETS=$(crange "$REST/workout_sets?select=id,workouts!inner(notes)&workouts.notes=eq.$NOTE_ENC")
[ "$BASE_SETS" = "51" ] && ok "51 séries baseline intactes" || ko "séries baseline = $BASE_SETS (attendu 51)"
BASE_NOTNULL=$(crange "$REST/workout_sets?select=id,workouts!inner(notes)&workouts.notes=eq.$NOTE_ENC&rpe=not.is.null")
[ "$BASE_NOTNULL" = "0" ] && ok "séries baseline lisibles avec rpe = null (non cassant)" || ko "$BASE_NOTNULL baseline avec rpe non null"

echo "-- 3. Garde-fous (statique) --"
grep -q "perceived_intensity" src/app/\(tabs\)/training/training-actions.ts \
  && ok "perceived_intensity global toujours écrit (inchangé)" || ko "perceived_intensity disparu"
grep -qi "perceived_intensity\|workouts" supabase/migrations/20260710000001_workout_set_rpe.sql \
  && ko "la migration touche workouts/perceived_intensity (interdit)" || ok "migration ne touche que workout_sets.rpe"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot12-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. MCP RPE par série (HTTP bearer) --"
if MCP_URL="$MCP_URL" MCP_SECRET="$MCP_SECRET" node scripts/lot12-mcp-rpe.mjs; then
  ok "MCP : log/get/update rpe (voir détail ci-dessus)"
else
  ko "MCP RPE (scripts/lot12-mcp-rpe.mjs)"
fi

echo "-- 6. DOM : champ RPE optionnel non bloquant --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot12-dom.mjs; then
  ok "DOM : champ RPE présent + validation non bloquée (voir détail ci-dessus)"
else
  ko "DOM séance RPE (scripts/e2e/lot12-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 12 : INCOMPLET =="; exit 1; fi
echo "== Lot 12 : OK =="
