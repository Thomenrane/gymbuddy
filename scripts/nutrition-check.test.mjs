// Prouve le garde-fou macros (scripts/lib/nutrition-ref.mjs) :
//  - une recette sous-estimée à ingrédients connus (cas type L10/D4) → "warn"
//  - un écart énorme → "warn_high" (probable erreur, distinct de warn)
//  - une recette correcte → "ok"
//  - une recette avec un ingrédient inconnu → "review"
//  - le détail par ingrédient (contributions) est renvoyé
//  - la DB branchée par-dessus le seed (tablesFromRows) fait autorité
//  - ancres CIQUAL correctes (non-régression de la table de référence)
import { checkRecipe, computeMacros, tablesFromRows, PER_100G } from "./lib/nutrition-ref.mjs";

let fail = 0;
const t = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fail = 1;
};

// Ancres web (CIQUAL) — la table ne doit pas dériver.
t("ancre poulet cru 121/23", PER_100G["blanc de poulet"][0] === 121 && PER_100G["blanc de poulet"][1] === 23);
t("ancre riz complet cru 356/77", PER_100G["riz brun"][0] === 356 && PER_100G["riz brun"][2] === 77);

// Cas type D4 (Wok crevettes riz brun) — macros stockées sous-estimées.
const d4 = {
  name: "Wok crevettes riz brun", kcal: 600, protein_g: 45, carbs_g: 68, fat_g: 13,
  ingredients: [
    { item: "crevettes décortiquées", qty: 200, unit: "g" },
    { item: "riz brun", qty: 75, unit: "g" },
    { item: "wok de légumes surgelés", qty: 300, unit: "g" },
    { item: "huile de sésame", qty: 10, unit: "g" },
    { item: "sauce soja réduite en sel + gingembre", qty: 1, unit: "portion" },
  ],
};
let r = checkRecipe(d4);
t(`recette sous-estimée (D4) → verdict "warn" (recomposé ${r.computed.kcal} vs 600, ${r.deltaPct.kcal}%)`,
  r.verdict === "warn" && r.computed.kcal > 680);

// Détail par ingrédient : chaque ingrédient connu contribue, les crevettes portent des protéines.
const crev = r.contributions.find((c) => c.item.startsWith("crevettes"));
t("détail par ingrédient renvoyé (contributions)", Array.isArray(r.contributions) && r.contributions.length === d4.ingredients.length);
t("contribution crevettes chiffrée (protéines > 0)", !!crev && crev.known && crev.protein_g > 0);

// Écart ÉNORME (mêmes ingrédients, kcal annoncées absurdement basses) → "warn_high".
const huge = checkRecipe({ ...d4, kcal: 300 });
t(`écart très élevé → verdict "warn_high" (${huge.deltaPct.kcal}%)`, huge.verdict === "warn_high");

// Même recette avec des macros corrigées (= recomposées) → "ok".
const d4fix = { ...d4, ...r.computed };
t("recette corrigée aux valeurs recomposées → verdict \"ok\"", checkRecipe(d4fix).verdict === "ok");

// Recette correcte du seed (L8 Bowl coréen, écart ~1%) → "ok".
const l8 = {
  name: "Bowl coréen bœuf & riz", kcal: 565, protein_g: 48, carbs_g: 55, fat_g: 15,
  ingredients: [
    { item: "haché de bœuf 5% MG", qty: 120, unit: "g" },
    { item: "riz brun", qty: 70, unit: "g" },
    { item: "légumes (carotte, courgette, épinards)", qty: 200, unit: "g" },
    { item: "huile de sésame", qty: 8, unit: "g" },
    { item: "sauce soja réduite en sel + gingembre + ail", qty: 1, unit: "portion" },
  ],
};
r = checkRecipe(l8);
t(`recette correcte (L8) → verdict "ok" (${r.deltaPct.kcal}%)`, r.verdict === "ok");

// Ingrédient inconnu → "review" (jamais compté 0 en silence).
const novel = {
  name: "Test tempeh", kcal: 400, protein_g: 30, carbs_g: 20, fat_g: 18,
  ingredients: [
    { item: "tempeh", qty: 150, unit: "g" }, // absent de la table
    { item: "riz brun", qty: 60, unit: "g" },
  ],
};
r = checkRecipe(novel);
t("ingrédient nouveau (tempeh) → verdict \"review\" + listé", r.verdict === "review" && r.unknown.some((u) => u.startsWith("tempeh")));

// La DB branchée par-dessus le seed résout l'ingrédient (add_ingredient_ref → curation).
const withTempeh = tablesFromRows([{ item: "tempeh", basis: "100g", kcal: 190, protein_g: 19, carbs_g: 9, fat_g: 11 }]);
const resolved = checkRecipe(novel, { tables: withTempeh });
t("tempeh ajouté en table (DB par-dessus seed) → plus \"review\"", resolved.verdict !== "review" && resolved.unknown.length === 0);
t("seed intact : les ancres du seed restent connues avec la table DB fusionnée", withTempeh.g["riz brun"][0] === 356);

// Robustesse : ingrédients vides → computed nul, pas de crash.
t("ingrédients vides → 0 kcal, pas d'erreur", computeMacros([]).computed.kcal === 0);

console.log(fail ? "\n  → ÉCHEC" : "\n  → garde-fou macros : tous les cas passent");
process.exit(fail);
