// Lot 18 — DOM : note par exercice dans l'écran séance.
// Deux exercices créés en séance vierge : une note saisie sur le premier
// (champ repliable, jamais requis), AUCUNE sur le second — la validation passe
// quand même (note facultative, jamais bloquante). Après enregistrement, la
// fiche séance affiche la note sous le bon exercice, la DB ne contient qu'UNE
// ligne workout_exercise_notes, et la note de séance globale reste distincte.
import { authedBrowser, rest, check, summary, BASE } from "./lib.mjs";

const D = "1999-12-19";
const EXO_A = "__NOTE_DOM_A__";
const EXO_B = "__NOTE_DOM_B__";
const NOTE = "douleur épaule test lot18";

async function cleanup() {
  await rest("DELETE", `workouts?workout_date=eq.${D}`).catch(() => {});
  await rest("DELETE", `exercises?name=like.__NOTE_DOM_%`).catch(() => {});
}

let browser, page;
try {
  await cleanup();
  const { browser: b, page: p } = await authedBrowser();
  browser = b;
  page = p;
  await page.goto(`${BASE}/training/muscu?date=${D}`, { waitUntil: "networkidle" });

  // Deux exercices créés à la volée.
  for (const exo of [EXO_A, EXO_B]) {
    await page.getByRole("button", { name: "Ajouter un exercice" }).click();
    await page.getByLabel("Rechercher un exercice").fill(exo);
    await page.getByRole("button", { name: `Créer «${exo}»` }).click();
    await page.getByLabel(`${exo} série 1 reps`).fill("10");
    await page.getByLabel(`${exo} série 1 poids`).fill("50");
  }

  // Note sur A uniquement : champ replié par défaut, ouvert via l'icône.
  check(
    "champ note replié par défaut (icône discrète)",
    (await page.getByLabel(`${EXO_A} note d'exercice (optionnel)`).count()) === 0
  );
  await page.getByLabel(`${EXO_A} : note d'exercice (optionnel)`).click();
  await page.getByLabel(`${EXO_A} note d'exercice (optionnel)`).fill(NOTE);
  // B : on ouvre le champ mais on le laisse VIDE — ne doit pas bloquer.
  await page.getByLabel(`${EXO_B} : note d'exercice (optionnel)`).click();

  // Validation : note de séance globale distincte, saisie dans la sheet.
  await page.getByRole("button", { name: "Terminer la séance" }).click();
  await page.getByLabel("Notes").fill("note de séance globale");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForURL(/\/training\/[0-9a-f-]{36}$/, { timeout: 20000 });

  // Fiche séance : la note apparaît sous le bon exercice.
  check("fiche séance : note affichée", (await page.getByText(NOTE).count()) > 0);
  check(
    "fiche séance : note de séance globale affichée aussi (distincte)",
    (await page.getByText("note de séance globale").count()) > 0
  );

  // DB : une seule ligne de note, attachée au bon exercice ; sets intacts.
  const workoutId = page.url().split("/").pop();
  const notes = await rest(
    "GET",
    `workout_exercise_notes?workout_id=eq.${workoutId}&select=note,exercise:exercises(name)`
  );
  check("DB : UNE seule note (exo sans note = aucune ligne)", notes.length === 1, JSON.stringify(notes));
  check("DB : note attachée au bon exercice", notes[0]?.exercise?.name === EXO_A && notes[0]?.note === NOTE);
  const [w] = await rest("GET", `workouts?id=eq.${workoutId}&select=notes`);
  check("DB : workouts.notes = note globale (distincte)", w?.notes === "note de séance globale");

  // Édition : la note revient pré-remplie, la vider ne bloque pas non plus.
  await page.goto(`${BASE}/training/muscu?edit=${workoutId}`, { waitUntil: "networkidle" });
  const noteInput = page.getByLabel(`${EXO_A} note d'exercice (optionnel)`);
  check("édition : note pré-remplie (champ visible)", (await noteInput.count()) === 1);
  check("édition : contenu de la note rechargé", (await noteInput.inputValue()) === NOTE);
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
process.exit(summary("Note par exercice (DOM)") ? (process.exitCode ?? 0) : 1);
