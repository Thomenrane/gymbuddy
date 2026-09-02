// Lot 23 — DOM : l'onglet 1 est le Plan de la semaine.
//
// Demande PO : « je n'utilise littéralement jamais l'écran Aujourd'hui →
// remplacer par autre chose », le journal et la pesée passant par Claude/MCP.
//
// Le piège de ce lot : l'ancien onglet 1 était le SEUL point d'entrée vers le
// plan ET vers les réglages. Le supprimer sans réancrer ces accès les rendrait
// orphelins. Le journal n'est pas supprimé non plus — c'est là qu'on relit et
// corrige ce que Claude encode par MCP —, il sort juste de la barre d'onglets.
import { authedBrowser, check, summary, BASE } from "./lib.mjs";

let browser;
try {
  const { browser: b, page } = await authedBrowser();
  browser = b;

  // --- 1. L'accueil est le Plan ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("accueil : titre « Plan »", (await page.getByRole("heading", { name: "Plan", exact: true }).count()) === 1);
  check("accueil : plus de widget pesée (journal déplacé)", (await page.locator('[data-testid="weight-widget"]').count()) === 0);

  // --- 2. Barre d'onglets : Plan · Training · Recettes · Tendances ---
  const nav = page.locator("nav").first();
  for (const label of ["Plan", "Training", "Recettes", "Tendances"]) {
    check(`onglet « ${label} »`, (await nav.getByText(label, { exact: true }).count()) === 1);
  }
  check("onglet « Aujourd'hui » retiré", (await nav.getByText("Aujourd'hui", { exact: true }).count()) === 0);

  // --- 3. Journal et réglages restent atteignables en un tap ---
  await page.getByLabel("Journal du jour").click();
  await page.waitForURL(/\/journal/, { timeout: 15000 });
  check("journal atteignable depuis l'accueil", page.url().includes("/journal"));
  check("journal : widget pesée intact", (await page.locator('[data-testid="weight-widget"]').count()) === 1);
  check("journal : ajout de repas intact", (await page.getByText("Ajouter").count()) > 0);

  // Navigation jour du journal : elle doit rester sur /journal, pas revenir au Plan.
  await page.getByLabel("Jour précédent").click();
  await page.waitForURL(/\/journal\?date=/, { timeout: 15000 });
  check("navigation jour du journal reste sur /journal", /\/journal\?date=\d{4}-\d{2}-\d{2}/.test(page.url()), page.url());

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByLabel("Réglages").click();
  await page.waitForURL(/\/reglages/, { timeout: 15000 });
  check("réglages atteignables depuis l'accueil (sinon orphelins)", page.url().includes("/reglages"));

  // --- 4. L'ancienne URL /plan continue de fonctionner ---
  await page.goto(`${BASE}/plan?week=2026-08-31`, { waitUntil: "networkidle" });
  check("/plan redirige vers l'accueil", new URL(page.url()).pathname === "/", page.url());
  check("/plan transmet la semaine demandée", page.url().includes("week=2026-08-31"), page.url());

  // --- 5. Liste de courses : aller-retour cohérent ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Courses/ }).click();
  await page.waitForURL(/\/plan\/courses/, { timeout: 15000 });
  check("liste de courses atteignable", page.url().includes("/plan/courses"));
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
process.exit(summary("onglet 1 = Plan (DOM)") ? process.exitCode ?? 0 : 1);
