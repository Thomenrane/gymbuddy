// Lot 20 — DOM : un exercice ajouté EN COURS de séance arrive avec les mêmes
// informations qu'un exercice de template.
//
// Demande PO : « quand j'ajoute un exercice et que je choisis dans la liste, il
// est créé vide au lieu d'avoir les mêmes informations que les exercices des
// séances ; j'aimerais que pour chaque exo que j'ai déjà fait y'ait les targets
// dans les cases + une ligne de texte qui dit ce que j'ai fait la dernière fois ».
//
// Deux cas couverts :
//   - exercice DÉJÀ FAIT (historique 4×8 @ 60, sans template) → cases
//     pré-remplies à l'objectif + ligne « Dernière »
//   - exercice CRÉÉ À LA VOLÉE → 3 séries vides, aucune ligne trompeuse
// Bonus : la recherche ignore les accents (« elevation » trouve « Élévation »).
import { authedBrowser, rest, check, summary, BASE, deleteByNames } from "./lib.mjs";

const D_HIST = "1999-12-16";
const D_SESS = "1999-12-21";
const EXO = "__OBJ_ADD_Élévation__";
const NEUF = "__OBJ_ADD_Inconnu__";

async function cleanup() {
  for (const d of [D_HIST, D_SESS]) {
    await rest("DELETE", `workouts?workout_date=eq.${d}`).catch(() => {});
  }
  await deleteByNames("exercises", [EXO, NEUF]);
}

let browser;
try {
  await cleanup();

  const [exo] = await rest("POST", "exercises", { name: EXO, measure_type: "reps" });
  const [hist] = await rest("POST", "workouts", { workout_date: D_HIST, type: "muscu" });
  await rest(
    "POST",
    "workout_sets",
    [1, 2, 3, 4].map((n) => ({
      workout_id: hist.id,
      exercise_id: exo.id,
      position: 0,
      set_number: n,
      reps: 8,
      weight_kg: 60,
    }))
  );

  const { browser: b, page } = await authedBrowser();
  browser = b;
  // Séance VIERGE : tout ce qui apparaît vient de la sheet « Ajouter ».
  await page.goto(`${BASE}/training/muscu?date=${D_SESS}`, { waitUntil: "networkidle" });

  // --- 1. Recherche insensible aux accents ---
  await page.getByRole("button", { name: "Ajouter un exercice" }).click();
  await page.getByLabel("Rechercher un exercice").fill("__obj_add_elevation__");
  const row = page.getByRole("button", { name: EXO });
  check("recherche sans accents : « elevation » trouve « Élévation »", (await row.count()) === 1);

  // --- 2. L'exercice ajouté arrive pré-rempli à l'objectif ---
  await row.click();
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: EXO, exact: true }) });
  await section.waitFor({ timeout: 15000 });
  for (const i of [1, 2, 3, 4]) {
    const reps = await page.getByLabel(`${EXO} série ${i} reps`).inputValue();
    const poids = await page.getByLabel(`${EXO} série ${i} poids`).inputValue();
    check(`série ${i} pré-remplie (8 reps @ 60)`, reps === "8" && poids === "60", `${reps}/${poids}`);
  }
  check(
    "4 séries reprises de la dernière perf (pas 3 vides)",
    (await page.getByLabel(`${EXO} série 5 reps`).count()) === 0
  );
  check("ligne « Dernière : 4×8 @ 60 kg »", await section.getByText(/Dernière\s*:\s*4×8 @ 60 kg/).count() > 0);
  check("une seule ligne de contexte (cohérent avec le Lot 19)", (await section.locator("p").count()) === 1);
  await section.getByLabel(`${EXO} : objectif et consignes`).click();
  check("ⓘ : objectif chiffré disponible", await section.getByText("Objectif : 4×8 @ 60 kg").count() > 0);

  // --- 3. Exercice créé à la volée : vide, sans texte trompeur ---
  await page.getByRole("button", { name: "Ajouter un exercice" }).click();
  await page.getByLabel("Rechercher un exercice").fill(NEUF);
  await page.getByRole("button", { name: `Créer «${NEUF}»` }).click();
  const neuve = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: NEUF, exact: true }) });
  await neuve.waitFor({ timeout: 15000 });
  check("exercice jamais fait : 3 séries vides", (await page.getByLabel(`${NEUF} série 1 reps`).inputValue()) === "");
  check("exercice jamais fait : pas de 4e série", (await page.getByLabel(`${NEUF} série 4 reps`).count()) === 0);
  check("exercice jamais fait : aucune ligne « Dernière »", (await neuve.getByText(/Dernière/).count()) === 0);

  // --- 4. L'ajout s'enregistre normalement ---
  await page.getByRole("button", { name: "Terminer la séance" }).click();
  await page.getByRole("button", { name: /^Enregistrer$/ }).click();
  await page.waitForURL(/\/training\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const saved = await rest(
    "GET",
    `workouts?workout_date=eq.${D_SESS}&select=id,workout_sets(reps,weight_kg,exercise:exercises(name))`
  );
  const sets = (saved ?? []).flatMap((w) => w.workout_sets ?? []);
  const ajoutes = sets.filter((s) => s.exercise?.name === EXO);
  check(
    "séance enregistrée avec l'exercice ajouté (4×8 @ 60)",
    ajoutes.length === 4 && ajoutes.every((s) => s.reps === 8 && Number(s.weight_kg) === 60),
    JSON.stringify(ajoutes)
  );
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  await browser?.close();
}
process.exit(summary("ajout d'exercice pré-rempli (DOM)") ? process.exitCode ?? 0 : 1);
