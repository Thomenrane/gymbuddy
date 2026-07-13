// Lot 16 — DOM : scan code-barres (saisie manuelle du code, pilotable sans
// caméra). Depuis Aujourd'hui → Ajouter → Scanner : le code EAN saisi affiche
// la fiche Open Food Facts, « Ajouter à la référence ingrédients » crée la
// ligne nutrition_ref (source=off, verified), et le log d'une portion pesée
// écrit un meal_log aux macros calculées depuis l'étiquette.
import { authedBrowser, rest, check, summary, BASE } from "./lib.mjs";

const DTEST = "1999-11-09"; // jour poubelle, nettoyé en fin de test
const EAN = "3017620422003"; // Nutella — fiche OFF complète et stable

async function cleanup() {
  await rest("DELETE", `nutrition_ref?ean=eq.${EAN}`).catch(() => {});
  await rest("DELETE", `meal_logs?log_date=eq.${DTEST}`).catch(() => {});
}

let browser, page;
try {
  await cleanup();
  const { browser: b, page: p } = await authedBrowser();
  browser = b;
  page = p;
  await page.goto(`${BASE}/?date=${DTEST}`, { waitUntil: "networkidle" });

  // Ouvre la sheet d'ajout du premier slot, puis le mode scan.
  await page.getByRole("button", { name: "Ajouter" }).first().click();
  await page.getByRole("button", { name: /Scanner/ }).click();
  check(
    "saisie manuelle du code disponible (repli sans caméra)",
    (await page.getByLabel("Code-barres").count()) > 0
  );

  // Saisit l'EAN → fiche produit (nom + macros /100 g depuis OFF).
  await page.getByLabel("Code-barres").fill(EAN);
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByText(/Nutella/i).first().waitFor({ timeout: 20000 });
  check("fiche produit : nom affiché", (await page.getByText(/Nutella/i).count()) > 0);
  check("fiche produit : macros /100 g", (await page.getByText(/\/ 100 g/).count()) > 0);

  // Ajout à la référence ingrédients → ligne nutrition_ref source=off.
  await page.getByRole("button", { name: /Ajouter à la référence/ }).click();
  await page.getByText(/ajouté à la référence/i).waitFor({ timeout: 15000 });
  const refs = await rest(
    "GET",
    `nutrition_ref?ean=eq.${EAN}&select=item,basis,kcal,verified,source`
  );
  check("nutrition_ref : 1 ligne créée", refs.length === 1, JSON.stringify(refs));
  check("nutrition_ref : source=off, basis=100g", refs[0]?.source === "off" && refs[0]?.basis === "100g");
  check("nutrition_ref : fiche complète → verified", refs[0]?.verified === true);
  check("nutrition_ref : kcal étiquette plausibles (500-600)", refs[0]?.kcal > 500 && refs[0]?.kcal < 600, String(refs[0]?.kcal));

  // Log d'une portion pesée : 45 g → macros calculées depuis /100 g.
  await page.getByLabel("Quantité en grammes").fill("45");
  await page.getByRole("button", { name: /^Logger dans/ }).click();
  // Succès = la sheet se ferme (onDone) ; la DB fait foi pour les macros.
  await page
    .getByLabel("Quantité en grammes")
    .waitFor({ state: "detached", timeout: 15000 });
  const logs = await rest(
    "GET",
    `meal_logs?log_date=eq.${DTEST}&select=free_label,kcal,is_estimate`
  );
  check("meal_log : 1 log libre créé", logs.length === 1, JSON.stringify(logs));
  check("meal_log : label produit + grammes", /45 g$/.test(logs[0]?.free_label ?? ""));
  const expected = Math.round(((refs[0]?.kcal ?? 0) * 45) / 100);
  check(
    `meal_log : kcal = étiquette × 0,45 (${expected})`,
    Math.abs((logs[0]?.kcal ?? 0) - expected) <= 1,
    String(logs[0]?.kcal)
  );
  check("meal_log : fiche complète → pas une estimation", logs[0]?.is_estimate === false);

  // Le jour affiche le log scanné (rechargement = état serveur, pas de course
  // avec le refresh RSC post-action).
  await page.reload({ waitUntil: "networkidle" });
  check("le jour affiche le log scanné (45 g)", (await page.getByText(/45 g/).count()) > 0);
} catch (e) {
  console.error("  FAIL", e.message);
  // Diagnostic : erreurs affichées dans la sheet, le cas échéant.
  try {
    const alerts = await page?.getByRole("alert").allTextContents();
    if (alerts?.length) console.error("  alerts:", alerts.join(" | "));
  } catch {}
  process.exitCode = 1;
} finally {
  await cleanup();
  await browser?.close();
}
process.exit(summary("Scan code-barres (DOM)") ? (process.exitCode ?? 0) : 1);
