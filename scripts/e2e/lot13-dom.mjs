// Lot 13 — DOM : l'écran Réglages rendu (auth réelle) contient la section
// « Préférences alimentaires » ÉDITABLE (tags seed affichés, champ d'ajout,
// bouton de suppression). Lecture seule ici — aucune écriture (add/delete sont
// prouvés par scripts/lot13-mcp-prefs.mjs).
import { authedBrowser, check, summary, BASE } from "./lib.mjs";

let browser;
try {
  const { browser: b, page } = await authedBrowser();
  browser = b;
  await page.goto(`${BASE}/reglages`, { waitUntil: "networkidle" });

  const heading = page.getByRole("heading", { name: /Préférences alimentaires/i });
  check("section « Préférences alimentaires » présente", (await heading.count()) > 0);

  // Tags seed de Florian.
  check("tag seed 'poisson blanc' affiché", (await page.getByText("poisson blanc").count()) > 0);
  check("tag seed 'thon' affiché", (await page.getByText(/^thon$/).count()) > 0);

  // Éditable : champ d'ajout + bouton de suppression.
  const addInput = page.getByLabel(/Ajouter une préférence pour Florian/i);
  check("champ d'ajout de préférence présent (éditable)", (await addInput.count()) > 0);
  const delBtn = page.getByLabel(/Supprimer poisson blanc/i);
  check("bouton de suppression par tag présent (éditable)", (await delBtn.count()) > 0);
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
process.exit(summary("Réglages préférences (DOM)") ? process.exitCode ?? 0 : 1);
