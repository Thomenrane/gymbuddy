// Lot 15 — DOM : depuis la vue Plan, la sheet d'un repas planifié propose
// « Voir la recette » qui ouvre la fiche recette existante (ingrédients +
// étapes), sans casser les actions existantes (portion, remplacer, retirer),
// et un retour préserve la semaine affichée.
import { authedBrowser, rest, check, summary, BASE } from "./lib.mjs";
import { mondayOf } from "../../src/lib/brussels-day.mjs";

const DTEST = "1999-11-08";
const MON = mondayOf(DTEST);
const SLOT = "dejeuner";

async function cleanup() {
  await rest("DELETE", `meal_plan_entries?plan_date=eq.${DTEST}`).catch(() => {});
}

let browser;
try {
  await cleanup();
  // Une recette avec ingrédients ET étapes (pour vérifier la fiche complète).
  const recipes = await rest(
    "GET",
    "recipes?is_active=eq.true&select=id,name,ingredients,steps&limit=50"
  );
  const recipe = recipes.find(
    (r) => Array.isArray(r.ingredients) && r.ingredients.length && Array.isArray(r.steps) && r.steps.length
  );
  if (!recipe) throw new Error("aucune recette avec ingrédients + étapes");

  await rest("POST", "meal_plan_entries", {
    plan_date: DTEST,
    slot: SLOT,
    recipe_id: recipe.id,
    portion_factor: 1,
  });

  const { browser: b, page } = await authedBrowser();
  browser = b;
  await page.goto(`${BASE}/plan?week=${MON}`, { waitUntil: "networkidle" });

  // Ouvre la sheet du repas planifié (bouton contenant le nom de la recette).
  await page.locator("button", { hasText: recipe.name }).first().click();

  check("action « Voir la recette » présente", await page.getByText("Voir la recette").count() > 0);
  check("action « Remplacer par une autre recette » toujours présente", await page.getByText(/Remplacer par une autre recette/).count() > 0);
  check("action « Retirer du plan » toujours présente", await page.getByText(/Retirer du plan/).count() > 0);
  check("réglage de portion toujours présent (×1)", await page.getByRole("button", { name: "×1" }).count() > 0);

  // Ouvre la fiche : navigue vers /recettes/<id> et montre ingrédients + étapes.
  await page.getByText("Voir la recette").first().click();
  await page.waitForURL(new RegExp(`/recettes/${recipe.id}`), { timeout: 15000 });
  check("fiche recette : titre affiché", await page.getByRole("heading", { name: recipe.name }).count() > 0);
  check("fiche recette : section Ingrédients", await page.getByText(/Ingrédients/).count() > 0);
  check("fiche recette : section Préparation (étapes)", await page.getByText(/Préparation/).count() > 0);
  const firstIng = String(recipe.ingredients[0].item ?? "").slice(0, 6);
  check("fiche recette : un ingrédient de la recette référencée", firstIng ? (await page.getByText(new RegExp(firstIng, "i")).count()) > 0 : true);

  // Retour → la vue Plan retrouve la semaine affichée.
  await page.goBack();
  await page.waitForURL(new RegExp(`/plan\\?week=${MON}`), { timeout: 15000 }).catch(() => {});
  check("retour → Plan sur la même semaine", new URL(page.url()).searchParams.get("week") === MON, page.url());
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  await browser?.close();
}
process.exit(summary("Plan → fiche recette (DOM)") ? process.exitCode ?? 0 : 1);
