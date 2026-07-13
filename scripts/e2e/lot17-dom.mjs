// Lot 17 — DOM : produit scanné ↔ recettes (saisie manuelle du code,
// pilotable sans caméra).
// 1. Page Ingrédients : scan → ajout à la référence → visible dans la liste,
//    puis suppression depuis la liste.
// 2. Fiche recette : ingrédient non référencé signalé, association par scan
//    (renommage vers le produit), propagation à l'autre recette qui utilise
//    le même ingrédient (« le scan gagne partout », sur décision explicite).
// 3. Verdict recomposé → « Aligner les macros » met la recette aux valeurs
//    étiquette exactes.
import { authedBrowser, rest, check, summary, BASE } from "./lib.mjs";

const EAN = "3017620422003"; // Nutella — fiche OFF complète et stable
const ITEM = "ingrédient-test-lot17";

async function cleanup() {
  await rest("DELETE", `nutrition_ref?ean=eq.${EAN}`).catch(() => {});
  await rest("DELETE", `recipes?name=like.Test%20lot17%20%E2%80%94*`).catch(() => {});
}

let browser, page;
try {
  await cleanup();
  // Deux recettes de test partageant l'ingrédient (pour la propagation).
  // Macros volontairement fausses (100 kcal vs ~162 recomposées pour 30 g).
  const mk = (name) => ({
    name,
    category: "collation",
    kcal: 100,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
    ingredients: [{ item: ITEM, qty: 30, unit: "g" }],
    source: "florian",
  });
  const [r1] = await rest("POST", "recipes", mk("Test lot17 — shaker"));
  await rest("POST", "recipes", mk("Test lot17 — bis"));

  const { browser: b, page: p } = await authedBrowser();
  browser = b;
  page = p;

  // ---- 1. Page Ingrédients : scan direct → référence, puis suppression ----
  await page.goto(`${BASE}/recettes/ingredients`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Scanner un produit" }).click();
  await page.getByLabel("Code-barres").fill(EAN);
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: /Ajouter à la référence/ }).click();
  await page.getByText(/ajouté à la référence/i).waitFor({ timeout: 15000 });
  let refs = await rest("GET", `nutrition_ref?ean=eq.${EAN}&select=item,source,verified`);
  check("page Ingrédients : scan → ligne nutrition_ref (source=off)", refs.length === 1 && refs[0].source === "off");
  const item = refs[0].item; // « nutella »
  await page.locator("button", { hasText: "Fermer" }).last().click();
  await page.getByText(item).first().waitFor({ timeout: 15000 });
  check("page Ingrédients : le produit scanné apparaît dans la liste", true);

  await page.getByLabel(`Supprimer ${item}`).click();
  await page.getByRole("button", { name: "Confirmer ?" }).click();
  // L'action serveur commit puis la ligne disparaît — la DB fait foi (poll).
  let gone = false;
  for (let i = 0; i < 30 && !gone; i++) {
    await page.waitForTimeout(500);
    gone = (await rest("GET", `nutrition_ref?ean=eq.${EAN}&select=id`)).length === 0;
  }
  check("page Ingrédients : suppression d'un produit scanné", gone);

  // ---- 2. Fiche recette : verdict + association + propagation ----
  await page.goto(`${BASE}/recettes/${r1.id}`, { waitUntil: "networkidle" });
  check("fiche : verdict recomposé affiché", (await page.getByText(/Recomposé depuis la référence/).count()) > 0);
  check("fiche : ingrédient signalé non référencé", (await page.getByText("non référencé").count()) > 0);

  await page.getByLabel(`Scanner le produit pour ${ITEM}`).click();
  await page.getByLabel("Code-barres").fill(EAN);
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: new RegExp(`Remplacer « ${ITEM} »`) }).click();
  await page.getByText(/autre recette.*utilise/i).waitFor({ timeout: 20000 });
  check("association : propagation proposée (1 autre recette)", (await page.getByText("Test lot17 — bis").count()) > 0);
  await page.getByRole("button", { name: /Basculer aussi ces recettes/ }).click();
  await page.getByText(/est\s+maintenant l'ingrédient/i).waitFor({ timeout: 15000 });
  await page.locator("button", { hasText: "Fermer" }).last().click();

  const recipes = await rest(
    "GET",
    `recipes?name=like.Test%20lot17%20%E2%80%94*&select=name,kcal,ingredients`
  );
  check(
    "association : ingrédient renommé dans LES DEUX recettes (le scan gagne)",
    recipes.length === 2 && recipes.every((r) => r.ingredients[0].item === item),
    JSON.stringify(recipes.map((r) => r.ingredients[0].item))
  );

  // ---- 3. Aligner les macros sur les valeurs recomposées ----
  await page.getByRole("button", { name: /Aligner les macros/ }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /Aligner les macros/ }).click();
  await page.getByText(/Macros alignées/).waitFor({ timeout: 15000 });
  const [after] = await rest("GET", `recipes?id=eq.${r1.id}&select=kcal,protein_g`);
  check(
    "alignement : kcal = étiquette × 0,30 (≈162, était 100)",
    Math.abs(after.kcal - 162) <= 2,
    String(after.kcal)
  );
} catch (e) {
  console.error("  FAIL", e.message);
  try {
    const alerts = await page?.getByRole("alert").allTextContents();
    if (alerts?.length) console.error("  alerts:", alerts.join(" | "));
  } catch {}
  process.exitCode = 1;
} finally {
  await cleanup();
  await browser?.close();
}
process.exit(summary("Produit scanné ↔ recettes (DOM)") ? (process.exitCode ?? 0) : 1);
