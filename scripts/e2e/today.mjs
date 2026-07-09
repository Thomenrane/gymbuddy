// E2E « Aujourd'hui » piloté dans un vrai navigateur (Playwright) :
// pesée réelle via le widget, navigation log→recette, swipe entre jours.
// Auth réelle, données de test 1999 nettoyées.
import { authedBrowser, swipe, rest, check, summary, BASE } from "./lib.mjs";

const D = "1999-10-11";
async function cleanup() {
  await rest("DELETE", `meal_logs?log_date=eq.${D}`);
  await rest("DELETE", `body_metrics?metric_date=eq.${D}`);
}

await cleanup();
const [pd1] = await rest("GET", "recipes?code=eq.PD1&select=id,name,kcal,protein_g,carbs_g,fat_g");
await rest("POST", "meal_logs", {
  log_date: D, slot: "petit_dej", recipe_id: pd1.id, portion_factor: 1,
  kcal: pd1.kcal, protein_g: pd1.protein_g, carbs_g: pd1.carbs_g, fat_g: pd1.fat_g,
});
await rest("POST", "meal_logs", {
  log_date: D, slot: "extra", free_label: "__E2E_LIBRE__",
  kcal: 700, protein_g: 30, carbs_g: 70, fat_g: 30,
});

const { browser, page } = await authedBrowser();
try {
  // --- Écran Aujourd'hui authentifié ---
  await page.goto(`${BASE}/?date=${D}`, { waitUntil: "networkidle" });
  check("écran Aujourd'hui chargé (pas redirigé vers login)", !page.url().includes("/login"));

  // --- 1. Widget de pesée : visible, cliquable, écrit en base ---
  const widget = page.getByTestId("weight-widget");
  check("widget de pesée visible", await widget.isVisible());
  await widget.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await dialog.locator("input").first().fill("81,3");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 8000 });
  const bm = await rest("GET", `body_metrics?metric_date=eq.${D}&select=weight_kg`);
  check("pesée enregistrée en base via le widget (81.3 kg)", bm.length === 1 && Number(bm[0].weight_kg) === 81.3);

  // --- 2. Log recette → « Voir la recette » ouvre la fiche ---
  await page.locator(`[data-recipe-id="${pd1.id}"]`).click();
  const sheet = page.getByRole("dialog");
  await sheet.waitFor({ state: "visible", timeout: 5000 });
  const recipeLink = sheet.getByRole("link", { name: "Voir la recette" });
  check("sheet d'un log recette : lien « Voir la recette » présent", await recipeLink.isVisible());
  await recipeLink.click();
  await page.waitForURL(`**/recettes/${pd1.id}`, { timeout: 8000 });
  check("navigation vers la fiche recette", page.url().includes(`/recettes/${pd1.id}`));
  check("fiche recette affiche le nom de la recette", (await page.content()).includes(pd1.name));

  // --- 3. Log libre : sheet SANS lien recette ---
  await page.goto(`${BASE}/?date=${D}`, { waitUntil: "networkidle" });
  await page.getByText("__E2E_LIBRE__").click();
  const freeSheet = page.getByRole("dialog");
  await freeSheet.waitFor({ state: "visible", timeout: 5000 });
  check(
    "sheet d'un log libre : PAS de lien « Voir la recette »",
    (await freeSheet.getByRole("link", { name: "Voir la recette" }).count()) === 0
  );
  await page.keyboard.press("Escape").catch(() => {});

  // --- 4. Swipe entre jours : sur aujourd'hui, swipe → recule d'un jour ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const before = page.url();
  await swipe(page, "main", 140); // swipe vers la droite = jour précédent
  await page.waitForURL(/\?date=\d{4}-\d{2}-\d{2}/, { timeout: 8000 }).catch(() => {});
  check("swipe → change de jour (URL ?date=…)", page.url() !== before && /\?date=\d{4}-\d{2}-\d{2}/.test(page.url()));
} finally {
  await browser.close();
  await cleanup();
}

const left = await rest("GET", `meal_logs?log_date=eq.${D}&select=id`);
check("nettoyage : zéro donnée de test restante", left.length === 0);

process.exit(summary("E2E Aujourd'hui") ? 0 : 1);
