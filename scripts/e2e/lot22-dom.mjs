// Lot 22 — DOM : indicateur « Reprendre » sur une séance quittée en cours.
//
// Demande PO : « quand je quitte et que je reviens au milieu d'une séance
// faudrait un indicateur "reprendre" sur la ligne de la session en cours ».
//
// Trois choses prouvées bout-en-bout :
//   1. ouvrir une séance PUIS repartir sans rien saisir → AUCUN indicateur
//      (fin du brouillon fantôme écrit au montage)
//   2. saisir une série puis quitter → indicateur avec la progression, et le
//      lien ramène la séance dans l'état exact où elle a été laissée
//   3. « Abandonner » efface le brouillon, et terminer la séance aussi
import { authedBrowser, rest, check, summary, BASE } from "./lib.mjs";

const D_SESS = "1999-12-22";
const EXO = "__RESUME_DOM__";

async function cleanup() {
  await rest("DELETE", `workouts?workout_date=eq.${D_SESS}`).catch(() => {});
  await rest("DELETE", `workout_templates?name=like.__RESUME_%`).catch(() => {});
  await rest("DELETE", `exercises?name=like.__RESUME_%`).catch(() => {});
}

let browser;
try {
  await cleanup();
  const [exo] = await rest("POST", "exercises", { name: EXO, measure_type: "reps" });
  const [tpl] = await rest("POST", "workout_templates", {
    name: "__RESUME_TPL__",
    type: "muscu",
    is_active: true,
  });
  await rest("POST", "template_exercises", {
    template_id: tpl.id,
    exercise_id: exo.id,
    position: 0,
    default_sets: 3,
    default_reps_min: 8,
    default_reps_max: 10,
  });

  const { browser: b, page } = await authedBrowser();
  browser = b;
  const sessionUrl = `${BASE}/training/muscu?template=${tpl.id}&date=${D_SESS}`;
  const resume = page.getByText("Reprendre", { exact: true });

  // --- 1. Ouvrir puis repartir sans rien saisir : aucun brouillon ---
  await page.goto(sessionUrl, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  check("séance seulement ouverte → aucun indicateur « Reprendre »", (await resume.count()) === 0);
  const stored = await page.evaluate(() => localStorage.getItem("gb-drafts"));
  check("aucun brouillon écrit au montage", stored === null || stored === "{}", String(stored));

  // --- 2. Saisir une série puis quitter : indicateur + reprise fidèle ---
  await page.goto(sessionUrl, { waitUntil: "networkidle" });
  await page.getByLabel(`${EXO} série 1 reps`).fill("9");
  await page.getByLabel(`${EXO} série 1 poids`).fill("42.5");
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  check("séance commencée → indicateur « Reprendre »", (await resume.count()) === 1);
  check("titre du template affiché", (await page.getByText("__RESUME_TPL__").count()) > 0);
  check("progression « 1/3 séries »", (await page.getByText(/1\/3 séries/).count()) > 0);
  check("heure de début affichée", (await page.getByText(/commencée à \d{2}:\d{2}/).count()) > 0);

  await page.getByLabel("Reprendre __RESUME_TPL__").click();
  await page.waitForURL(/\/training\/muscu\?template=/, { timeout: 15000 });
  // Le brouillon est relu APRÈS l'hydratation : on attend le signal de l'app
  // (« Séance en cours restaurée ») plutôt qu'un délai arbitraire, sinon on lit
  // encore le pré-remplissage serveur.
  const restaure = page.getByText(/Séance en cours restaurée/);
  await restaure.waitFor({ timeout: 15000 });
  check("reprise : message « Séance en cours restaurée »", (await restaure.count()) === 1);
  check("reprise : reps saisies restaurées", (await page.getByLabel(`${EXO} série 1 reps`).inputValue()) === "9");
  check("reprise : poids saisi restauré", (await page.getByLabel(`${EXO} série 1 poids`).inputValue()) === "42.5");

  // --- 3. « Abandonner » efface le brouillon ---
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.getByLabel("Abandonner __RESUME_TPL__").click();
  check("après abandon : plus d'indicateur", (await resume.count()) === 0);
  const afterDiscard = await page.evaluate(() => localStorage.getItem("gb-drafts"));
  check("après abandon : brouillon supprimé du stockage", afterDiscard === "{}", String(afterDiscard));

  // --- 4. Terminer une séance efface aussi le brouillon ---
  await page.goto(sessionUrl, { waitUntil: "networkidle" });
  await page.getByLabel(`${EXO} série 1 reps`).fill("10");
  await page.getByRole("button", { name: "Terminer la séance" }).click();
  await page.getByRole("button", { name: /^Enregistrer$/ }).click();
  await page.waitForURL(/\/training\/[0-9a-f-]{36}/, { timeout: 20000 });
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  check("après enregistrement : plus d'indicateur", (await resume.count()) === 0);
  const afterSave = await page.evaluate(() => localStorage.getItem("gb-drafts"));
  check("après enregistrement : brouillon supprimé", afterSave === "{}", String(afterSave));
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  await browser?.close();
}
process.exit(summary("reprendre une séance (DOM)") ? process.exitCode ?? 0 : 1);
