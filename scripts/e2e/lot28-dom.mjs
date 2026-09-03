// Lot 28 — DOM : le scan remonte sur l'accueil, « Ouvrir le jour » disparaît.
//
// Deux demandes PO d'une ligne chacune :
//   « j'aimerais que le bouton pour scanner les codes barres soit sur la page
//     plan et pas sur la page recette »
//   « sur la page training le bouton "ouvrir le jour" ne sert à rien »
//
// Le piège du second : /training/day n'est PAS une route morte — c'est là qu'on
// retombe après avoir enregistré, modifié ou supprimé une séance (5 appelants).
// Supprimer le bouton ne doit pas casser ces retours.
import { authedBrowser, check, summary, BASE } from "./lib.mjs";

let browser;
try {
  const { browser: b, page } = await authedBrowser();
  browser = b;

  // --- 1. Accueil : le scan est là, en un tap ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Plan", exact: true }).waitFor({ timeout: 15000 });
  const scan = page.getByLabel("Scanner un produit");
  check("accueil : bouton « Scanner un produit »", (await scan.count()) === 1);

  const box = await scan.boundingBox();
  check(
    "cible tactile ≥ 40 px (mains occupées, produit dans l'autre)",
    Boolean(box) && box.height >= 40 && box.width >= 40,
    box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "introuvable"
  );

  await scan.click();
  const sheet = page.getByRole("dialog");
  await sheet.waitFor({ timeout: 15000 });
  check("le scan ouvre bien une feuille", (await sheet.count()) === 1);
  check(
    "feuille intitulée « Scanner — Extra » (créneau qui ne présume de rien)",
    (await sheet.getAttribute("aria-label")) === "Scanner — Extra",
    String(await sheet.getAttribute("aria-label"))
  );
  // Le scanner lui-même : on ne peut pas donner de caméra à Chromium headless,
  // mais le composant doit être monté et proposer sa saisie de repli.
  check(
    "le scanner est monté (pas une feuille vide)",
    (await sheet.getByText(/scan|code|ean/i).count()) > 0
  );
  await page.keyboard.press("Escape").catch(() => {});
  await page.getByLabel("Fermer").first().click().catch(() => {});

  // --- 2. Training : plus de « Ouvrir le jour » ---
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Training", exact: true }).waitFor({ timeout: 15000 });
  check(
    "training : « Ouvrir le jour » retiré",
    (await page.getByText("Ouvrir le jour").count()) === 0
  );
  check("training : l'aperçu du jour reste", (await page.locator("h2").count()) > 0);
  check(
    "training : « Nouvelle séance » toujours accessible",
    (await page.getByLabel("Nouvelle séance").count()) === 1
  );

  // La route jour reste servie : c'est le retour après enregistrement.
  const today = new Date().toISOString().slice(0, 10);
  const resp = await page.goto(`${BASE}/training/day/${today}`, { waitUntil: "domcontentloaded" });
  check(
    "la route /training/day répond encore (retour après enregistrement)",
    Boolean(resp) && resp.status() < 400,
    String(resp?.status())
  );

  // --- 3. Recettes : ne se présente plus comme un scanner ---
  await page.goto(`${BASE}/recettes`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Recettes", exact: true }).waitFor({ timeout: 15000 });
  check(
    "recettes : plus de « scan de produits »",
    (await page.getByText(/scan de produits/i).count()) === 0
  );
  const refLink = page.getByRole("link", { name: /Référence ingrédients/i });
  check("recettes : « Référence ingrédients » présent", (await refLink.count()) === 1);
  check(
    "recettes : le lien mène toujours à /recettes/ingredients",
    (await refLink.getAttribute("href")) === "/recettes/ingredients"
  );
} finally {
  await browser?.close();
}
summary("scan sur l'accueil, jour retiré (DOM)");
