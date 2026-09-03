// Lot 19 — DOM : densité de l'écran séance + objectif dans les cases.
//
// Demande PO (screenshot à l'appui) : « quand je suis en train de faire une
// séance, y'a plein de texte inutile » et « je veux pas 2 lignes, je veux une
// ligne "Dernière" et que l'exo soit pré-rempli par objectif ».
//
// Seed déterministe : un exercice avec une cible Claude de 67,5 kg, une note
// longue, un historique 3×6 @ 67,5 et un template 4 séries / 4-6 reps / RPE 8 /
// repos 150 s. Objectif attendu = 4×6 @ 67.5 kg (charge inchangée → on garde le
// haut de fourchette déjà tenu). Nettoyage complet en sortie.
import { authedBrowser, rest, check, summary, BASE, deleteByNames, draftIdsNow, cleanupNewDrafts } from "./lib.mjs";

const D_HIST = "1999-12-17";
const D_SESS = "1999-12-20";
const EXO = "__OBJ_DOM_A__";
const CONV = "convention test lot19";
const NOTE =
  "Reste à 67,5 : dernière fois RPE 9-10, dernière série tombée à 5 reps. Vise 4×6 propres avant de monter";

async function cleanup() {
  for (const d of [D_HIST, D_SESS]) {
    await rest("DELETE", `workouts?workout_date=eq.${d}`).catch(() => {});
  }
  await deleteByNames("workout_templates", ["__OBJ_DOM_TPL__"]);
  await deleteByNames("exercises", [EXO]);
}

let browser;
// Lot 27 : ouvrir l'écran séance crée une ligne « En cours » en base — on note
// les brouillons existants pour ne supprimer que ceux que CE test aura créés.
const draftsBefore = await draftIdsNow();
try {
  await cleanup();

  const [exo] = await rest("POST", "exercises", {
    name: EXO,
    measure_type: "reps",
    note: CONV,
    target_weight_kg: 67.5,
    target_weight_note: NOTE,
  });
  const [hist] = await rest("POST", "workouts", { workout_date: D_HIST, type: "muscu" });
  await rest(
    "POST",
    "workout_sets",
    [1, 2, 3].map((n) => ({
      workout_id: hist.id,
      exercise_id: exo.id,
      position: 0,
      set_number: n,
      reps: 6,
      weight_kg: 67.5,
    }))
  );
  const [tpl] = await rest("POST", "workout_templates", {
    name: "__OBJ_DOM_TPL__",
    type: "muscu",
    is_active: true,
  });
  await rest("POST", "template_exercises", {
    template_id: tpl.id,
    exercise_id: exo.id,
    position: 0,
    default_sets: 4,
    default_reps_min: 4,
    default_reps_max: 6,
    target_rpe: 8,
    rest_seconds: 150,
  });

  const { browser: b, page } = await authedBrowser();
  browser = b;
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}&date=${D_SESS}`, {
    waitUntil: "networkidle",
  });
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: EXO, exact: true }) });
  check("section de l'exercice rendue", (await section.count()) === 1);

  // --- 1. Les cases portent l'OBJECTIF (4 séries × 6 reps @ 67,5 kg) ---
  for (const i of [1, 2, 3, 4]) {
    const reps = await page.getByLabel(`${EXO} série ${i} reps`).inputValue();
    const poids = await page.getByLabel(`${EXO} série ${i} poids`).inputValue();
    check(`série ${i} pré-remplie à l'objectif (6 reps @ 67.5)`, reps === "6" && poids === "67.5", `${reps}/${poids}`);
  }
  check(
    "4 séries (default_sets du template), pas 3 (dernière perf)",
    (await page.getByLabel(`${EXO} série 5 reps`).count()) === 0 &&
      (await page.getByLabel(`${EXO} série 4 reps`).count()) === 1
  );

  // --- 2. UNE seule ligne de contexte dans le flux ---
  check("une seule ligne de texte dans la carte (« Dernière »)", (await section.locator("p").count()) === 1);
  check("la ligne est bien « Dernière : 3×6 @ 67.5 kg »", await section.getByText(/Dernière\s*:\s*3×6 @ 67\.5 kg/).count() > 0);
  check("date raccourcie (17/12, pas 1999-12-17)", await section.getByText(/17\/12/).count() > 0);
  check("« Dernière fois » (ancien libellé) supprimé", (await section.getByText(/Dernière fois/).count()) === 0);
  check("« Poids cible » hors du flux", (await section.getByText(/Poids cible/).count()) === 0);
  check("« Cible : » (fourchette/RPE/repos) hors du flux", (await section.getByText(/Cible\s*:/).count()) === 0);
  check("note longue de Claude hors du flux", (await section.getByText(NOTE).count()) === 0);
  check("note de convention du catalogue hors du flux", (await section.getByText(CONV).count()) === 0);

  // --- 3. Le ⓘ rend tout ce qui a été replié, objectif compris ---
  await section.getByLabel(`${EXO} : objectif et consignes`).click();
  check("ⓘ : objectif retrouvé après avoir tapé dans les cases", await section.getByText("Objectif : 4×6 @ 67.5 kg").count() > 0);
  check("ⓘ : fourchette de reps", await section.getByText(/4-6 reps/).count() > 0);
  check("ⓘ : RPE cible", await section.getByText(/RPE 8/).count() > 0);
  check("ⓘ : temps de repos", await section.getByText(/repos 150s/).count() > 0);
  check("ⓘ : note longue de Claude", await section.getByText(NOTE).count() > 0);
  check("ⓘ : note de convention du catalogue", await section.getByText(CONV).count() > 0);

  // --- 4. Les deux bandeaux d'aide ont quitté le haut de l'écran ---
  check("bandeau « Rappel : double progression » supprimé", (await page.getByText("Rappel : double progression").count()) === 0);
  check("bandeau « Échelle RPE » supprimé du flux", (await page.getByText(/^Échelle RPE/).count()) === 0);
  await page.getByLabel("Aide : double progression, RPE, affichage").click();
  check("sheet « ? » : double progression", await page.getByRole("heading", { name: "Double progression" }).count() > 0);
  check("sheet « ? » : échelle RPE", await page.getByRole("heading", { name: /Échelle RPE/ }).count() > 0);

  // --- 5. Colonne RPE masquée par défaut, réactivable, jamais destructive ---
  check("colonne RPE masquée par défaut", (await page.getByLabel(/RPE ressenti/i).count()) === 0);
  await page.getByRole("switch", { name: "Afficher la colonne RPE" }).click();
  check("colonne RPE réaffichée par la préférence", (await page.getByLabel(/RPE ressenti/i).count()) === 4);
  await page.getByRole("switch", { name: "Afficher la colonne RPE" }).click();
  check("colonne RPE remasquée", (await page.getByLabel(/RPE ressenti/i).count()) === 0);
  await page.getByRole("button", { name: "Fermer" }).first().click();

  // --- 6. L'objectif s'enregistre tel quel (pré-rempli = éditable, décision PO) ---
  await page.getByRole("button", { name: "Terminer la séance" }).click();
  await page.getByRole("button", { name: /^Enregistrer$/ }).click();
  await page.waitForURL(/\/training\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const saved = await rest("GET", `workouts?workout_date=eq.${D_SESS}&select=id,workout_sets(reps,weight_kg)`);
  const sets = (saved ?? []).flatMap((w) => w.workout_sets ?? []);
  check(
    "séance enregistrée : 4 séries 6 reps @ 67.5",
    sets.length === 4 && sets.every((s) => s.reps === 6 && Number(s.weight_kg) === 67.5),
    JSON.stringify(sets)
  );
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  await browser?.close();
  // Après la fermeture SEULEMENT : un autosave encore en vol recréerait
  // sinon la ligne « En cours » juste après sa suppression.
  await cleanupNewDrafts(draftsBefore);
}
process.exit(summary("séance : densité + objectif (DOM)") ? process.exitCode ?? 0 : 1);
