// Lot 24 — DOM : confort en salle (chrono de repos, boutons ±, écran allumé).
//
// Trois manques constatés à l'usage réel :
//   - `rest_seconds` du template n'était qu'un texte affiché, aucun chrono
//   - saisir « 67.5 » au clavier numérique entre deux séries est le vrai frein
//   - l'écran s'éteint pendant le repos et il faut déverrouiller à chaque série
import { authedBrowser, rest, check, summary, BASE } from "./lib.mjs";

const D_SESS = "1999-12-23";
const EXO = "__CONFORT_DOM__";
const REPOS = 150;

async function cleanup() {
  await rest("DELETE", `workouts?workout_date=eq.${D_SESS}`).catch(() => {});
  await rest("DELETE", `workout_templates?name=like.__CONFORT_%`).catch(() => {});
  await rest("DELETE", `exercises?name=like.__CONFORT_%`).catch(() => {});
}

let browser;
try {
  await cleanup();
  const [exo] = await rest("POST", "exercises", { name: EXO, measure_type: "reps" });
  const [tpl] = await rest("POST", "workout_templates", {
    name: "__CONFORT_TPL__",
    type: "muscu",
    is_active: true,
  });
  await rest("POST", "template_exercises", {
    template_id: tpl.id,
    exercise_id: exo.id,
    position: 0,
    default_sets: 3,
    default_reps_min: 6,
    default_reps_max: 8,
    rest_seconds: REPOS,
  });

  const { browser: b, page } = await authedBrowser();
  browser = b;
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}&date=${D_SESS}`, {
    waitUntil: "networkidle",
  });

  // --- 1. Boutons ± : uniquement sous la case en cours de saisie ---
  const plusReps = page.getByLabel("Augmenter les reps de 1");
  const plusPoids = page.getByLabel("Augmenter le poids de 2.5");
  check("aucun bouton ± avant de toucher une case (densité préservée)",
    (await plusReps.count()) === 0 && (await plusPoids.count()) === 0);

  const reps1 = page.getByLabel(`${EXO} série 1 reps`);
  await reps1.focus();
  check("case reps active → boutons ±1", (await plusReps.count()) === 1);
  check("case reps active → PAS les boutons de poids", (await plusPoids.count()) === 0);

  const avant = await reps1.inputValue();
  await plusReps.click();
  check("+1 rep appliqué", (await reps1.inputValue()) === String(Number(avant) + 1),
    `${avant} → ${await reps1.inputValue()}`);
  check("le focus reste dans la case (les ± restent affichés)", (await plusReps.count()) === 1);
  await page.getByLabel("Diminuer les reps de 1").click();
  check("−1 rep appliqué", (await reps1.inputValue()) === avant);

  const poids1 = page.getByLabel(`${EXO} série 1 poids`);
  await poids1.fill("60");
  await poids1.focus();
  check("case poids active → boutons ±2,5", (await plusPoids.count()) === 1);
  await plusPoids.click();
  check("+2,5 kg appliqué", (await poids1.inputValue()) === "62.5", await poids1.inputValue());
  await page.getByLabel("Diminuer le poids de 2.5").click();
  check("−2,5 kg appliqué", (await poids1.inputValue()) === "60", await poids1.inputValue());

  // --- 2. Chrono de repos : lancé depuis l'exercice, arrêtable ---
  const chrono = page.getByRole("timer", { name: "Repos en cours" });
  check("aucun chrono avant de le lancer", (await chrono.count()) === 0);
  await page.getByLabel(`Lancer le repos de ${REPOS}s`).click();
  check("chrono affiché", (await chrono.count()) === 1);
  const affiche = await chrono.innerText();
  check("compte à rebours au format m:ss, parti de 2:30", /2:(30|29|28)/.test(affiche), affiche);
  await page.waitForTimeout(1500);
  check("le compte à rebours descend", (await chrono.innerText()) !== affiche, await chrono.innerText());
  await page.getByLabel("Arrêter le repos").click();
  check("chrono arrêté d'un tap", (await chrono.count()) === 0);

  // --- 3. Écran maintenu allumé pendant la séance ---
  const wakeLock = await page.evaluate(async () => {
    if (!("wakeLock" in navigator)) return "absent";
    try {
      const s = await navigator.wakeLock.request("screen");
      await s.release();
      return "disponible";
    } catch {
      return "refusé";
    }
  });
  check("API wakeLock utilisable dans ce navigateur (sinon dégradation muette)",
    wakeLock !== "absent", wakeLock);

  // --- 4. Rien de tout ça ne casse l'enregistrement ---
  await page.getByRole("button", { name: "Terminer la séance" }).click();
  await page.getByRole("button", { name: /^Enregistrer$/ }).click();
  await page.waitForURL(/\/training\/[0-9a-f-]{36}/, { timeout: 20000 });
  const saved = await rest("GET", `workouts?workout_date=eq.${D_SESS}&select=id,workout_sets(reps,weight_kg)`);
  const sets = (saved ?? []).flatMap((w) => w.workout_sets ?? []);
  check("séance enregistrée après usage des ± et du chrono", sets.length === 3, JSON.stringify(sets));
  check("le poids ajusté au pouce est bien celui enregistré",
    sets.some((s) => Number(s.weight_kg) === 60), JSON.stringify(sets));
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  await browser?.close();
}
process.exit(summary("confort en salle (DOM)") ? process.exitCode ?? 0 : 1);
