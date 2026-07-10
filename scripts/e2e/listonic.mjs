// E2E : export « Copier pour Listonic » sur l'écran Courses.
// Prouve, dans un vrai navigateur authentifié, que le bouton copie bien le
// texte au format Listonic (1 article/ligne « Nom qty unité ») dans le
// presse-papier — Listonic ne s'enregistrant pas comme cible de partage,
// le flux repose sur le copier-coller.
import { authedBrowser, rest, check, summary, BASE } from "./lib.mjs";
import { mondayOf } from "../../src/lib/brussels-day.mjs";
import {
  aggregateShoppingList,
  shoppingListForListonic,
} from "../../src/lib/shopping-list.mjs";

const TESTDATE = "1999-12-06"; // un lundi
const MON = mondayOf(TESTDATE);

async function cleanup() {
  await rest("DELETE", `meal_plan_entries?plan_date=eq.${TESTDATE}`).catch(() => {});
}

let browser;
try {
  await cleanup();
  // Une recette active avec des ingrédients pour garnir la liste.
  const recipes = await rest(
    "GET",
    "recipes?is_active=eq.true&select=id,name,kcal,protein_g,carbs_g,fat_g,ingredients&limit=20"
  );
  const recipe = recipes.find((r) => Array.isArray(r.ingredients) && r.ingredients.length);
  if (!recipe) throw new Error("aucune recette active avec ingrédients");

  await rest("POST", "meal_plan_entries", {
    plan_date: TESTDATE,
    slot: "diner",
    recipe_id: recipe.id,
    portion_factor: 1,
  });

  // Attendu = même pipeline pur que l'app.
  const expected = shoppingListForListonic(
    aggregateShoppingList([{ portion_factor: 1, recipe: { ingredients: recipe.ingredients } }])
  );

  ({ browser } = await openAndAssert(expected));
  process.exit(summary("export Listonic") ? 0 : 1);
} catch (e) {
  console.error("  FAIL", e.message);
  process.exit(1);
} finally {
  await cleanup();
  await browser?.close();
}

async function openAndAssert(expected) {
  const { browser, context, page } = await authedBrowser();
  // Autorise la lecture/écriture du presse-papier pour vérifier la copie.
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });

  await page.goto(`${BASE}/plan/courses?week=${MON}`, { waitUntil: "networkidle" });

  const btn = page.getByRole("button", { name: /Copier pour Listonic/i });
  check("bouton « Copier pour Listonic » présent", (await btn.count()) > 0);

  await btn.first().click();
  await page.waitForFunction(() => document.querySelector('[role="status"]'), { timeout: 5000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());

  check("la copie remplit le presse-papier", Boolean(clip && clip.trim()));
  check(
    "le texte copié est au format Listonic (= pipeline pur de l'app)",
    clip === expected,
    `\n    attendu:\n${expected}\n    reçu:\n${clip}`
  );
  const lines = clip.split("\n");
  check(
    "un article par ligne, sans en-tête de rayon",
    lines.length >= 1 && lines.every((l) => !/^[A-ZÉ-]+$/.test(l.trim())) && !clip.includes(" : ")
  );

  return { browser };
}
