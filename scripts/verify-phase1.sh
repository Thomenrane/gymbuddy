#!/usr/bin/env bash
# ============================================================
# Contrat de fin de Phase 1 (onglet Recettes) — exit != 0 si incomplet.
# 1. tsc --noEmit et next build verts
# 2. Routes liste + détail rendent sans erreur (serveur next start local,
#    session réelle générée via l'API admin — aucun email envoyé)
# 3. CRUD + duplication contre Supabase : créer une recette de test,
#    la dupliquer, la modifier, l'archiver, puis nettoyage complet
# 4. Les 32 recettes seedées (code non null) sont intactes (checksum)
# Requiert : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# (env ou .env.local) et SUPABASE_SERVICE_ROLE_KEY (env).
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3111
OWNER_EMAIL="thomenrane@gmail.com"
FAIL=0
ok()   { echo "  OK   $1"; }
ko()   { echo "  FAIL $1"; FAIL=1; }
check(){ if "${@:2}" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquante}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY manquante}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquante (env)}"

REST="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
SRV=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json")

echo "== Phase 1 — vérification mécanique =="

echo "-- 1. Build --"
check "tsc --noEmit" npx tsc --noEmit
check "next build" npm run build

echo "-- 2. Empreinte des 32 recettes seedées (avant) --"
seed_checksum() {
  curl -sf "$REST/recipes?code=not.is.null&select=code,name,category,kcal,protein_g,carbs_g,fat_g,ingredients&order=code" "${SRV[@]}" | md5sum | cut -d' ' -f1
}
SEED_BEFORE=$(seed_checksum)
SEED_COUNT=$(curl -sf "$REST/recipes?code=not.is.null&select=id" "${SRV[@]}" -H "Prefer: count=exact" -o /dev/null -D - | grep -i content-range | grep -o '/[0-9]*' | tr -d '/')
[ "$SEED_COUNT" = "32" ] && ok "32 recettes seedées présentes" || ko "recettes seedées: $SEED_COUNT != 32"

echo "-- 3. CRUD + duplication (REST, service role) --"
CREATED=$(curl -sf -X POST "$REST/recipes" "${SRV[@]}" -H "Prefer: return=representation" -d '{
  "name": "__VERIFY_PHASE1__", "category": "collation", "kcal": 111,
  "protein_g": 10, "carbs_g": 11, "fat_g": 3,
  "ingredients": [{"item": "test", "qty": 1, "unit": "g"}],
  "steps": ["étape test"], "tags": ["__test__"], "source": "florian"
}')
TEST_ID=$(node -e "console.log(JSON.parse(process.argv[1])[0].id)" "$CREATED" 2>/dev/null || true)
[ -n "$TEST_ID" ] && ok "création (id: ${TEST_ID:0:8}…)" || ko "création"

# Duplication : même logique que l'app (copie, nom suffixé, code null)
ORIGINAL=$(curl -sf "$REST/recipes?id=eq.$TEST_ID&select=name,category,kcal,protein_g,carbs_g,fat_g,ingredients,steps,tags" "${SRV[@]}")
DUP_BODY=$(node -e "
const r = JSON.parse(process.argv[1])[0];
console.log(JSON.stringify({ ...r, name: r.name + ' — variante', source: 'florian' }));
" "$ORIGINAL")
DUP=$(curl -sf -X POST "$REST/recipes" "${SRV[@]}" -H "Prefer: return=representation" -d "$DUP_BODY")
DUP_ID=$(node -e "console.log(JSON.parse(process.argv[1])[0].id)" "$DUP" 2>/dev/null || true)
[ -n "$DUP_ID" ] && [ "$DUP_ID" != "$TEST_ID" ] && ok "duplication (id: ${DUP_ID:0:8}…)" || ko "duplication"

curl -sf -X PATCH "$REST/recipes?id=eq.$TEST_ID" "${SRV[@]}" -d '{"kcal": 222}' -o /dev/null
KCAL=$(curl -sf "$REST/recipes?id=eq.$TEST_ID&select=kcal" "${SRV[@]}" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)[0].kcal))")
[ "$KCAL" = "222" ] && ok "modification (kcal 111 → 222)" || ko "modification (kcal=$KCAL)"

curl -sf -X PATCH "$REST/recipes?id=eq.$TEST_ID" "${SRV[@]}" -d '{"is_active": false}' -o /dev/null
ARCHIVED=$(curl -sf "$REST/recipes?id=eq.$TEST_ID&select=is_active" "${SRV[@]}" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)[0].is_active))")
[ "$ARCHIVED" = "false" ] && ok "archivage (is_active=false)" || ko "archivage"

echo "-- 4. Rendu des routes (serveur local + session réelle) --"
pkill -f "next start -p $PORT" 2>/dev/null || true
# NODE_USE_ENV_PROXY : le fetch de Node ignore HTTPS_PROXY par défaut ;
# indispensable dans les environnements derrière un proxy egress (no-op sinon).
NODE_USE_ENV_PROXY=1 npx next start -p $PORT >/tmp/verify-p1-server.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill $SERVER_PID 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  # Nettoyage des données de test, même en cas d'échec au milieu du script
  [ -n "${TEST_ID:-}" ] && curl -s -X DELETE "$REST/recipes?id=eq.$TEST_ID" "${SRV[@]}" -o /dev/null || true
  [ -n "${DUP_ID:-}" ] && curl -s -X DELETE "$REST/recipes?id=eq.$DUP_ID" "${SRV[@]}" -o /dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done

# Session sans email : lien magique généré côté admin → token_hash
TOKEN_HASH=$(curl -sf -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/generate_link" "${SRV[@]}" \
  -d "{\"type\": \"magiclink\", \"email\": \"$OWNER_EMAIL\"}" \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).hashed_token))")
JAR=$(mktemp)
# Vérification stricte : la confirmation doit rediriger vers / (succès),
# pas vers /login?error=1 (échec de verifyOtp).
CONFIRM_LOC=$(curl -s -o /dev/null -w "%{redirect_url}" -c "$JAR" \
  "http://localhost:$PORT/auth/confirm?token_hash=$TOKEN_HASH&type=magiclink")
case "$CONFIRM_LOC" in
  *"/login"*) ko "session: verifyOtp a échoué (redirigé vers $CONFIRM_LOC)" ;;
  */) ok "session authentifiée (magic link admin, sans email)" ;;
  *) ko "session: redirection inattendue ($CONFIRM_LOC)" ;;
esac

LIST_HTML=$(mktemp)
LIST_CODE=$(curl -s -b "$JAR" -o "$LIST_HTML" -w "%{http_code}" "http://localhost:$PORT/recettes")
[ "$LIST_CODE" = "200" ] && grep -q "Bowl skyr granola" "$LIST_HTML" \
  && ok "liste /recettes : 200 + recettes seedées visibles" \
  || ko "liste /recettes (HTTP $LIST_CODE)"

PD1_ID=$(curl -sf "$REST/recipes?code=eq.PD1&select=id" "${SRV[@]}" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)[0].id))")
DETAIL_HTML=$(mktemp)
DETAIL_CODE=$(curl -s -b "$JAR" -o "$DETAIL_HTML" -w "%{http_code}" "http://localhost:$PORT/recettes/$PD1_ID")
[ "$DETAIL_CODE" = "200" ] && grep -q "skyr nature" "$DETAIL_HTML" && grep -qi "ingrédients" "$DETAIL_HTML" \
  && ok "détail /recettes/[PD1] : 200 + ingrédients rendus" \
  || ko "détail /recettes/[id] (HTTP $DETAIL_CODE)"

echo "-- 5. Nettoyage + intégrité du seed --"
curl -sf -X DELETE "$REST/recipes?id=eq.$TEST_ID" "${SRV[@]}" -o /dev/null && ok "suppression recette de test"
curl -sf -X DELETE "$REST/recipes?id=eq.$DUP_ID" "${SRV[@]}" -o /dev/null && ok "suppression variante de test"
LEFT=$(curl -sf "$REST/recipes?name=like.__VERIFY_PHASE1__*&select=id" "${SRV[@]}" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length))")
[ "$LEFT" = "0" ] && ok "aucune donnée de test restante" || ko "données de test restantes: $LEFT"

SEED_AFTER=$(seed_checksum)
[ "$SEED_BEFORE" = "$SEED_AFTER" ] && ok "32 recettes seedées inchangées (checksum identique)" || ko "seed modifié !"

if [ "$FAIL" -ne 0 ]; then
  echo "== Phase 1 : INCOMPLÈTE =="
  exit 1
fi
echo "== Phase 1 : OK =="
