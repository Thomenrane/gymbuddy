// E2E : export « Vers Listonic » sur l'écran Courses.
// Prouve, dans un vrai navigateur authentifié, que le bouton partage bien
// le texte au format Listonic (1 article/ligne « Nom qty unité »), en
// stubbant navigator.share pour capturer la charge utile de façon
// déterministe (le sheet natif n'est pas pilotable en headless).
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
  // Stub navigator.share AVANT tout script de page : capture le texte partagé.
  await context.addInitScript(() => {
    window.__shared = null;
    navigator.share = async (data) => {
      window.__shared = data.text;
    };
  });

  await page.goto(`${BASE}/plan/courses?week=${MON}`, { waitUntil: "networkidle" });

  const shareBtn = page.getByRole("button", { name: /Listonic/i });
  check("bouton d'export Listonic présent", (await shareBtn.count()) > 0);
  check(
    "libellé 'Vers Listonic' (navigator.share détecté)",
    /Vers Listonic/.test(await shareBtn.first().innerText())
  );

  await shareBtn.first().click();
  await page.waitForFunction(() => window.__shared !== null, { timeout: 5000 });
  const shared = await page.evaluate(() => window.__shared);

  check("le partage envoie du texte non vide", Boolean(shared && shared.trim()));
  check(
    "le texte partagé est au format Listonic (= pipeline pur de l'app)",
    shared === expected,
    `\n    attendu:\n${expected}\n    reçu:\n${shared}`
  );
  const lines = shared.split("\n");
  check(
    "un article par ligne, sans en-tête de rayon",
    lines.length >= 1 && lines.every((l) => !/^[A-ZÉ-]+$/.test(l.trim())) && !shared.includes(" : ")
  );

  return { browser };
}
