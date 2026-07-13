// Garde-fou macros : recompose une recette depuis ses ingrédients (table
// CIQUAL de scripts/lib/nutrition-ref.mjs) et compare aux macros fournies.
// À exécuter AVANT d'encoder une recette (rule CLAUDE.md).
//
// Usage :
//   node scripts/verify-recipe-macros.mjs recette.json     # 1 recette (ou tableau)
//   cat recette.json | node scripts/verify-recipe-macros.mjs
//   node scripts/verify-recipe-macros.mjs --all            # audit du livre (DB)
//
// Format recette : { name?, kcal, protein_g, carbs_g, fat_g,
//                    ingredients:[{item, qty, unit}] }
// Codes de sortie : 0 = tout ok, 1 = au moins un warn/warn_high, 2 = "review".
import fs from "node:fs";
import { checkRecipe } from "./lib/nutrition-ref.mjs";

const ICON = {
  ok: "✅ ok",
  warn: "⚠️ à corriger",
  warn_high: "❌ probable erreur",
  review: "🔎 à vérifier",
};

function report(recipe) {
  const r = checkRecipe(recipe);
  const name = recipe.name || recipe.code || "(recette)";
  console.log(`\n${ICON[r.verdict]}  ${name}`);
  const line = (l, key, unit = "") =>
    console.log(
      `   ${l.padEnd(10)} fourni ${String(r.claimed[key]).padStart(5)}${unit}` +
      ` · recomposé ${String(r.computed[key]).padStart(5)}${unit}` +
      `  (${r.deltaPct[key] >= 0 ? "+" : ""}${r.deltaPct[key]}%)`
    );
  line("kcal", "kcal");
  line("protéines", "protein_g", " g");
  line("glucides", "carbs_g", " g");
  line("lipides", "fat_g", " g");
  if (r.unknown.length) {
    console.log(`   ⚠️ ingrédients non référencés (web-vérifier + ajouter à la table) :`);
    for (const u of r.unknown) console.log(`      · ${u}`);
  }
  if (r.verdict === "warn" || r.verdict === "warn_high")
    console.log(`   → écart kcal ${r.deltaPct.kcal}% > ±${r.tolerancePct}% : corriger les macros avant d'encoder.`);
  return r.verdict;
}

async function fetchAll() {
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB || !SRK) { console.error("--all requiert NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(3); }
  const res = await fetch(`${SB}/rest/v1/recipes?is_active=eq.true&select=code,name,kcal,protein_g,carbs_g,fat_g,ingredients&order=code`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  if (!res.ok) { console.error("fetch DB:", res.status, await res.text()); process.exit(3); }
  return res.json();
}

function readStdin() {
  try { return fs.readFileSync(0, "utf8"); } catch { return ""; }
}

const arg = process.argv[2];
let recipes;
if (arg === "--all") recipes = await fetchAll();
else {
  const raw = arg && arg !== "-" ? fs.readFileSync(arg, "utf8") : readStdin();
  if (!raw.trim()) { console.error("Aucune recette (fichier, stdin, ou --all)."); process.exit(3); }
  const parsed = JSON.parse(raw);
  recipes = Array.isArray(parsed) ? parsed : [parsed];
}

const counts = { ok: 0, warn: 0, warn_high: 0, review: 0 };
for (const r of recipes) counts[report(r)]++;
const toFix = counts.warn + counts.warn_high;
console.log(`\n${recipes.length} recette(s) : ${counts.ok} ok · ${toFix} à corriger · ${counts.review} à vérifier`);
process.exit(toFix ? 1 : counts.review ? 2 : 0);
