#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Lot 27 (séance en cours en base) — exit != 0 sinon.
#
# Ce lot REMPLACE la mécanique de brouillon du Lot 22 (localStorage) et retire
# donc scripts/verify-lot22.sh. Ce n'est pas un affaiblissement : la promesse
# vérifiée est la MÊME — « une séance commencée puis quittée est visible et
# reprenable » — et elle est ici vérifiée sur un chemin STRICTEMENT plus fort.
# Le Lot 22 n'écrivait que si le PO modifiait une case (drapeau `dirty`) ; or
# depuis le Lot 19 les cases arrivent pré-remplies à l'objectif, donc une séance
# faite comme prévu ne touchait rien et disparaissait. Le test DOM d'ici refait
# EXACTEMENT ce geste — ouvrir, ne rien toucher, repartir — que le Lot 22
# laissait passer, et il vérifie en plus ce que le localStorage ne pouvait pas
# offrir : la séance existe côté serveur, donc sur n'importe quel appareil.
#
# 1. tsc + next build verts.
# 2. La mécanique localStorage est bien PARTIE (pas juste débranchée) : plus de
#    drapeau `dirty`, plus d'index gb-drafts, plus de composant ResumeCard.
# 3. Statique : le brouillon naît à l'OUVERTURE (pas d'une modification), une
#    seule écriture en vol, l'édition d'une séance passée n'en crée aucun, et le
#    brouillon est effacé à l'enregistrement comme à l'abandon.
# 4. Migration : table à part, RLS activée, AUCUNE colonne ajoutée à workouts —
#    c'est l'invariant du lot (15 lectures de workouts n'ont rien à exclure).
# 5. Étanchéité : aucune lecture de workouts ne filtre sur un statut, parce
#    qu'aucune n'en a besoin. Si quelqu'un déplace les brouillons dans workouts,
#    ce contrat le dit.
# 6. DOM (scripts/e2e/lot27-dom.mjs) : ouvrir sans rien toucher → « En cours »,
#    reprise fidèle, un seul brouillon, rien dans workouts, abandon effectif.
#
# Local (CI) : serveur local. Distant : BASE_URL=<url>.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3227
FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?manquante (env)}"

EDT="src/components/training/session-editor.tsx"
ACT="src/app/(tabs)/training/training-actions.ts"
PAGE="src/app/(tabs)/training/page.tsx"
MUSCU="src/app/(tabs)/training/muscu/page.tsx"
CARD="src/components/training/draft-card.tsx"
SRV="src/lib/workout-drafts-server.ts"
MIG="supabase/migrations/20260903000002_workout_drafts.sql"
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

echo "== Lot 27 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. La mécanique localStorage a bien disparu --"
# Débrancher sans supprimer laisserait deux sources de vérité pour la même
# séance — celle du navigateur ressusciterait au premier import oublié.
for F in src/lib/session-draft.mjs src/lib/session-drafts-store.ts \
         src/components/training/resume-card.tsx scripts/verify-lot22.sh; do
  [ -e "$F" ] && ko "$F existe encore (deux sources de vérité)" || ok "$(basename "$F") supprimé"
done
# --exclude : ce contrat NOMME les symboles qu'il interdit ; sans ça il se
# trouve lui-même et échoue toujours (la faute de verify-lot25 avec « security
# invoker »).
if grep -rq --exclude=verify-lot27.sh "gb-drafts\|draftsStore\|ResumeCard" src/ scripts/; then
  ko "référence résiduelle à l'index localStorage"
else
  ok "plus aucune référence à l'index localStorage"
fi
grep -q "const dirty = useRef(false)" "$EDT" \
  && ko "le drapeau « dirty » est de retour : une séance non modifiée redeviendrait invisible" \
  || ok "plus de drapeau « dirty » (c'était la cause du bug)"

echo "-- 3. Statique : naissance, unicité, effacement --"
grep -q "saveWorkoutDraft({" "$EDT" && ok "l'éditeur écrit le brouillon en base" || ko "aucune écriture serveur"
grep -q "if (editId) return;" "$EDT" \
  && ok "l'édition d'une séance passée ne crée pas de brouillon" || ko "l'édition créerait un brouillon parasite"
grep -q "if (savingRef.current)" "$EDT" \
  && ok "une seule écriture en vol (pas deux lignes « En cours » pour une séance)" || ko "écritures concurrentes possibles"
# L'effacement se fait DANS saveWorkout, même aller-retour : effacer côté
# client juste avant de naviguer faisait courir l'effacement, un autosave en vol
# et la navigation les uns contre les autres — la redirection après
# « Enregistrer » en sortait parfois perdante (échec reproduit 1 fois sur 2).
grep -q "draftId: draftIdRef.current," "$EDT" \
  && ok "le brouillon est effacé par l'enregistrement lui-même" || ko "effacement hors de la transaction d'enregistrement"
grep -q "finishingRef.current = true;" "$EDT" \
  && ok "l'autosave est coupé pendant l'enregistrement (pas de résurrection)" || ko "un autosave en vol recréerait la ligne"
grep -q "if (input.draftId) {" "$ACT" \
  && ok "saveWorkout supprime le brouillon après avoir écrit les séries" || ko "saveWorkout ignore le brouillon"
grep -q "deleteWorkoutDraft" "$CARD" && ok "« Abandonner » depuis la liste" || ko "aucun abandon possible"
grep -q "export async function saveWorkoutDraft" "$ACT" && ok "action d'écriture" || ko "action absente"
grep -q "Brouillon introuvable" "$ACT" \
  && ok "un brouillon terminé ailleurs n'est pas ressuscité" || ko "une mise à jour recréerait un fantôme"
grep -q "<DraftCard" "$PAGE" && ok "ligne « En cours » dans l'onglet Training" || ko "ligne absente"
grep -q "draft: draftId" "$MUSCU" && ok "reprise par ?draft=" || ko "aucune reprise"
grep -q "resumedTemplateId = draft.template_id" "$MUSCU" \
  && ok "la reprise conserve le lien au template" || ko "le lien au template serait perdu à la reprise"

echo "-- 4. Migration : table à part, workouts intacte --"
grep -q "create table workout_drafts" "$MIG" && ok "table workout_drafts créée" || ko "table absente"
grep -q "enable row level security" "$MIG" && ok "RLS activée" || ko "RLS absente : table ouverte"
grep -q "create policy owner_all on workout_drafts" "$MIG" && ok "policy owner_all" || ko "aucune policy"
grep -qE "alter table workouts|alter table +workouts" "$MIG" \
  && ko "la migration touche à workouts (l'invariant du lot est de NE PAS y toucher)" \
  || ok "workouts intacte : les 15 lectures n'ont rien à exclure"

echo "-- 5. Étanchéité : aucune lecture n'a besoin d'exclure quoi que ce soit --"
# Si un jour quelqu'un déplace les brouillons DANS workouts, il devra filtrer —
# et ce contrat doit le forcer à réviser sa copie plutôt que le laisser passer.
if grep -rn 'from("workouts")' src/ | grep -q "status"; then
  ko "une lecture de workouts filtre sur un statut : les brouillons y sont donc entrés"
else
  ok "aucune lecture de workouts ne filtre : les brouillons sont ailleurs"
fi
grep -q 'from("workout_drafts")' "$SRV" && ok "lecture des brouillons isolée dans son module" || ko "lecture absente"

echo "-- 6. Serveur ($RUN_BASE) --"
if [ -z "${BASE_URL:-}" ]; then
  pkill -f "next start -p $PORT" 2>/dev/null || true
  NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-lot27-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
  ok "serveur local prêt (port $PORT)"
else
  ok "cible distante ($RUN_BASE) — pas de serveur local"
fi

# Compte AVANT le DOM : depuis ce lot, ouvrir l'écran séance crée une ligne en
# base. Un test qui ouvre sans terminer ni abandonner laisserait un « En cours »
# fantôme dans la vraie base du PO — c'est arrivé, 4 lignes après une passe.
DRAFTS_BEFORE=$(curl -s -I --get "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/workout_drafts" \
  --data-urlencode "select=id" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Prefer: count=exact" \
  | tr -d '\r' | sed -n 's#.*content-range: [^/]*/##Ip')

echo "-- 7. DOM : ouvrir sans rien toucher, quitter, reprendre --"
if NODE_USE_ENV_PROXY=1 NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
   BASE_URL="$RUN_BASE" node scripts/e2e/lot27-dom.mjs; then
  ok "DOM : séance en cours visible, reprenable, abandonnable"
else
  ko "DOM (scripts/e2e/lot27-dom.mjs)"
fi

echo "-- 8. Aucune donnée de test laissée en base --"
LEFT=$(curl -s --get "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/workout_drafts" \
  --data-urlencode "select=id,title" --data-urlencode "title=eq.__ENCOURS_TPL__" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
[ "$LEFT" = "[]" ] && ok "aucun brouillon de test résiduel (par nom)" || ko "brouillons de test restants : $LEFT"

# Le contrôle par NOM ne suffit pas : un brouillon porte le titre du template,
# donc un test ouvrant un template RÉEL du PO laisse une ligne qu'aucun nom de
# test ne trahit. Seul le décompte le voit.
DRAFTS_AFTER=$(curl -s -I --get "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/workout_drafts" \
  --data-urlencode "select=id" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Prefer: count=exact" \
  | tr -d '\r' | sed -n 's#.*content-range: [^/]*/##Ip')
if [ "$DRAFTS_AFTER" = "$DRAFTS_BEFORE" ]; then
  ok "décompte des brouillons inchangé ($DRAFTS_BEFORE) : rien n'a fui"
else
  ko "brouillons : $DRAFTS_BEFORE avant, $DRAFTS_AFTER après — des « En cours » fantômes sont restés"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Lot 27 : INCOMPLET =="; exit 1; fi
echo "== Lot 27 : OK =="
