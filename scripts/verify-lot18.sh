#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 18 (note texte libre par exercice dans une séance) —
# exit != 0 sinon. (Numéroté 18 : les lots 16-17 = scan code-barres, déjà
# mergés — la spec PO de ce lot disait « 16 », numéro déjà pris.)
# 1. tsc + next build verts.
# 2. Migration NON CASSANTE : nouvelle table workout_exercise_notes
#    (unique(workout_id, exercise_id), cascade, RLS) — les séances/sets
#    existants restent lisibles, note absente = null, 3 baselines intactes.
# 3. MCP (HTTP bearer, scripts/lot18-mcp-notes.mjs) : log_workout enregistre
#    une note sur UN exercice précis et pas les autres ; get_workouts et
#    get_exercise_history la renvoient attachée au bon exercice (null sinon) ;
#    update_workout préserve (omise) / remplace (fournie) / efface (null) ;
#    la note de séance globale (workouts.notes) reste distincte. Nettoyage.
# 4. Statique : facultative jamais bloquante, pas de note PAR SÉRIE.
# 5. DOM (scripts/e2e/lot18-dom.mjs) : champ note optionnel par exercice dans
#    l'écran séance, validation OK avec note vide, note affichée sur la fiche,
#    note rechargée en édition. Nettoyage.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3218
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"
: "${MCP_SECRET:?manquante (env)}"

MIG="supabase/migrations/20260713000003_workout_exercise_notes.sql"
SVC="src/lib/mcp/service.ts"
RTE="src/app/api/[transport]/route.ts"
EDT="src/components/training/session-editor.tsx"
ACT="src/app/(tabs)/training/training-actions.ts"
FICHE="src/app/(tabs)/training/[id]/page.tsx"
RUN_BASE="${BASE_URL:-http://localhost:$PORT}"
MCP_URL="${MCP_URL:-$RUN_BASE/api/mcp}"
REST() { curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$1"; }

cleanup() {
  kill "${SERVER_PID:-0}" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
}
trap cleanup EXIT

echo "== Lot 18 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Migration non cassante (table dédiée, pas de note par série) --"
grep -q "create table workout_exercise_notes" "$MIG" && ok "table workout_exercise_notes (note par workout × exercice)" || ko "table absente"
grep -q "unique (workout_id, exercise_id)" "$MIG" && ok "une seule note par (séance, exercice)" || ko "unicité absente"
grep -q "on delete cascade" "$MIG" && ok "cascade à la suppression de séance" || ko "cascade absente"
grep -q "is_owner()" "$MIG" && ok "RLS owner-only" || ko "RLS absente"
grep -Eq "alter table workout_sets" "$MIG" && ko "la migration touche workout_sets (interdit : pas de note par série)" \
  || ok "workout_sets non touchée (pas de note par série)"
BASE_COUNT=$(REST "workouts?notes=eq.baseline%20seed%20%E2%80%94%20poids%20de%20d%C3%A9part&select=id" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(0,'utf8')).length))" 2>/dev/null || echo 0)
[ "$BASE_COUNT" = "3" ] && ok "3 baselines intactes en base" || ko "baselines : $BASE_COUNT (attendu 3)"
REST "workout_sets?select=id,rpe&limit=1" | grep -q '"id"' && ok "sets existants toujours lisibles" || ko "sets illisibles"
NOTES_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/workout_exercise_notes?select=id&limit=1")
[ "$NOTES_CODE" = "200" ] && ok "table notes accessible (migrée)" || ko "table notes inaccessible (HTTP $NOTES_CODE)"

echo "-- 3. Statique : service + route + UI --"
grep -q "insertExerciseNotes" "$SVC" && ok "service : écriture des notes par exercice" || ko "écriture absente"
grep -q "exercise_note: noteByWorkout" "$SVC" && ok "service : exercise_note dans get_exercise_history" || ko "history sans note"
grep -q "exercise_notes:workout_exercise_notes" "$SVC" && ok "service : notes dans get_workouts/update_workout" || ko "get_workouts sans notes"
grep -q "e.note === undefined ? oldByExercise.get" "$SVC" && ok "service : note omise = préservée (update)" || ko "préservation absente"
grep -q '"Note libre pour' "$RTE" && ok "route : note par exercice exposée (log/update)" || ko "schéma zod sans note"
grep -q "sessionNote" "$EDT" && grep -q "note d'exercice (optionnel)" "$EDT" && ok "éditeur : champ note repliable par exercice" || ko "champ note absent"
grep -q 'note: ex.sessionNote?.trim() || null' "$EDT" && ok "éditeur : note vide → null (jamais bloquante)" || ko "note vide mal gérée"
grep -q "noteByExercise" "$FICHE" && ok "fiche séance : note affichée sous l'exercice" || ko "fiche sans note"
grep -q "note?: string | null" "$ACT" && ok "action app : note transportée avec l'exercice" || ko "action sans note"

echo "-- 4. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot18-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

echo "-- 5. MCP notes par exercice (HTTP bearer) --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   MCP_URL="$MCP_URL" MCP_SECRET="$MCP_SECRET" node scripts/lot18-mcp-notes.mjs; then
  ok "MCP : log/get/history/update de la note par exercice (détail ci-dessus)"
else
  ko "MCP notes (scripts/lot18-mcp-notes.mjs)"
fi
# Nettoyage des exercices de test MCP (les séances sont déjà supprimées).
curl -s -X DELETE -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/exercises?name=like.__NOTE_TEST_%25" -o /dev/null || true

echo "-- 6. DOM : champ note optionnel, jamais bloquant --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot18-dom.mjs; then
  ok "DOM : saisie/affichage/édition de la note, validation OK sans note"
else
  ko "DOM (scripts/e2e/lot18-dom.mjs)"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 18 : INCOMPLET =="; exit 1; fi
echo "== Lot 18 : OK =="
