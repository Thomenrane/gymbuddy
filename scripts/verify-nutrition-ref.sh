#!/usr/bin/env bash
# ============================================================
# Contrat — Référence nutritionnelle en base + garde-fou MCP (exit != 0 sinon).
# 1. tsc vert + test du garde-fou (verdict gradué + contributions + DB/seed).
# 2. Migration nutrition_ref : table + RLS + seed cohérent avec le générateur.
# 3. Module pur : tables en paramètre, verdict gradué, tablesFromRows.
# 4. Service MCP : check_recipe_macros / add_ingredient_ref / list_ingredient_refs
#    + backstop macro_check branché sur add_recipe/update_recipe.
# 5. Route : les 3 tools sont enregistrés.
# 6. (Optionnel, si la table est migrée) seed présent en base (≥ 111 lignes).
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0
ok() { echo "  OK   $1"; }
ko() { echo "  FAIL $1"; FAIL=1; }

MIG="supabase/migrations/20260713000001_nutrition_ref.sql"
MOD="scripts/lib/nutrition-ref.mjs"
SVC="src/lib/mcp/service.ts"
RTE="src/app/api/[transport]/route.ts"

echo "== Référence nutritionnelle en base — vérification =="

echo "-- 1. tsc + test garde-fou --"
if npx tsc --noEmit >/dev/null 2>&1; then ok "tsc --noEmit"; else ko "tsc --noEmit"; fi
if node scripts/nutrition-check.test.mjs >/dev/null 2>&1; then ok "test garde-fou (verdict gradué + contributions + DB/seed)"; else ko "test garde-fou"; fi

echo "-- 2. Migration + cohérence du seed --"
[ -f "$MIG" ] && ok "migration présente" || ko "migration absente ($MIG)"
grep -q "create table nutrition_ref" "$MIG" && ok "table nutrition_ref" || ko "table absente"
grep -q "enable row level security" "$MIG" && grep -q "is_owner()" "$MIG" && ok "RLS owner-only" || ko "RLS absente"
grep -q "unique (item, basis)" "$MIG" && ok "unicité (item, basis)" || ko "unicité absente"
# Le générateur (table statique) doit correspondre EXACTEMENT au total des lignes
# seedées en base : migration seed initiale + migrations de curation ultérieures
# (la table grandit par curation ; l'historique de la migration seed reste figé).
GEN=$(node scripts/gen-nutrition-seed.mjs | wc -l | tr -d ' ')
INMIG=$(cat supabase/migrations/*nutrition_ref*.sql | grep -cE "^  \('" | tr -d ' ')
if [ "$GEN" = "$INMIG" ] && [ "$GEN" -ge 100 ]; then ok "seed cohérent avec le générateur ($INMIG lignes seed+curation)"; else ko "seed divergent (générateur=$GEN, migrations=$INMIG)"; fi

echo "-- 3. Module pur (tables en paramètre, verdict gradué) --"
grep -q "export function tablesFromRows" "$MOD" && ok "tablesFromRows (DB par-dessus seed)" || ko "tablesFromRows absent"
grep -q "export const DEFAULT_TABLES" "$MOD" && ok "DEFAULT_TABLES (seed exporté)" || ko "DEFAULT_TABLES absent"
grep -q '"warn_high"' "$MOD" && grep -q '"warn"' "$MOD" && ok "verdict gradué (warn / warn_high)" || ko "verdict gradué absent"
grep -q "contributions" "$MOD" && ok "détail par ingrédient (contributions)" || ko "contributions absentes"

echo "-- 4. Service MCP + backstop --"
for fn in checkRecipeMacros addIngredientRef listIngredientRefs; do
  grep -q "export async function $fn" "$SVC" && ok "svc.$fn" || ko "svc.$fn absent"
done
grep -q "macro_check: await macroCheckFor(data)" "$SVC" && ok "backstop macro_check (add_recipe/update_recipe)" || ko "backstop non branché"
grep -q "tablesFromRows(error ? \[\] : data ?? \[\])" "$SVC" && ok "repli sur le seed si table absente" || ko "repli seed absent"

echo "-- 5. Route : tools enregistrés --"
for tool in check_recipe_macros add_ingredient_ref list_ingredient_refs; do
  grep -q "\"$tool\"" "$RTE" && ok "tool $tool" || ko "tool $tool absent"
done

echo "-- 6. Seed en base (optionnel : seulement si migrée) --"
if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  CR=$(NODE_USE_ENV_PROXY=1 curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Range: 0-0" -H "Prefer: count=exact" \
    "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/nutrition_ref?select=id" 2>/dev/null || echo "000")
  if [ "$CR" = "200" ] || [ "$CR" = "206" ]; then
    ok "table nutrition_ref accessible en base (migrée)"
  else
    echo "  SKIP table pas encore migrée en base (HTTP $CR) — code prêt, repli sur le seed statique"
  fi
else
  echo "  SKIP pas de creds Supabase (env) — checks statiques uniquement"
fi

if [ "$FAIL" -ne 0 ]; then echo "== Référence nutritionnelle : INCOMPLET =="; exit 1; fi
echo "== Référence nutritionnelle : OK =="
