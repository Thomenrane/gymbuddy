// Lot 29 — DOM : proposition de progression, pastille, ✓ et ✗.
//
// Demande PO : « si j'atteins l'objectif 2× d'affilée, la fois d'après j'ai un
// nouvel objectif de charge qui propose une charge plus élevée selon une
// progression logique, avec une pastille qui montre que c'est nouveau, et je
// peux accepter ou pas avec un V ou X ».
//
// On fabrique la situation exacte : un exercice avec une cible, DEUX séances
// passées où l'objectif est atteint, et on exige la proposition. Puis on
// vérifie qu'UNE seule séance réussie ne suffit pas, et que le ✗ ne repropose
// pas la même valeur.
import {
  authedBrowser,
  check,
  summary,
  rest,
  BASE,
  deleteByNames,
  draftIdsNow,
  cleanupNewDrafts,
} from "./lib.mjs";

const TPL = "__PROGRESSION_TPL__";
const EX = "__PROGRESSION_EX__";
const D1 = "1999-11-02";
const D2 = "1999-11-09";

const draftsBefore = await draftIdsNow();
let exId, tplId;
try {
  // --- Seed : cible 60 kg, fourchette 4-6, deux séances 3×6 @ 60 (objectif atteint)
  const [ex] = await rest("POST", "/exercises", {
    name: EX,
    measure_type: "reps",
    target_weight_kg: 60,
    progression_step_kg: 2.5,
  });
  exId = ex.id;
  const [tpl] = await rest("POST", "/workout_templates", { name: TPL, type: "muscu", is_active: true });
  tplId = tpl.id;
  await rest("POST", "/template_exercises", {
    template_id: tpl.id,
    exercise_id: ex.id,
    position: 1,
    default_sets: 3,
    default_reps_min: 4,
    default_reps_max: 6,
    target_rpe: 8,
  });
  const seedSession = async (date, reps) => {
    const [w] = await rest("POST", "/workouts", { workout_date: date, type: "muscu", template_id: tpl.id });
    await rest(
      "POST",
      "/workout_sets",
      [1, 2, 3].map((n) => ({
        workout_id: w.id,
        exercise_id: ex.id,
        position: 1,
        set_number: n,
        reps,
        weight_kg: 60,
        rpe: 7,
      }))
    );
    return w.id;
  };

  // --- 1. UNE seule séance réussie : rien ne doit être proposé
  await seedSession(D1, 6);
  const { browser: b, page } = await authedBrowser();
  var browser = b;
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: TPL }).waitFor({ timeout: 15000 });
  check(
    "une seule séance réussie → aucune pastille « Nouveau »",
    (await page.getByText("Nouveau", { exact: true }).count()) === 0
  );

  // --- 2. Deux séances réussies : proposition 60 → 62,5
  await seedSession(D2, 6);
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: TPL }).waitFor({ timeout: 15000 });
  check(
    "deux séances réussies → pastille « Nouveau »",
    (await page.getByText("Nouveau", { exact: true }).count()) === 1
  );
  await page.getByLabel(`${EX} : objectif et consignes`).click();
  check(
    "la proposition est chiffrée (60 → 62,5 kg)",
    (await page.getByText(/Proposition\s*:\s*60 → 62,5 kg/).count()) === 1,
    await page.getByText(/Proposition/).first().textContent().catch(() => "absente")
  );
  check(
    "la proposition dit POURQUOI",
    (await page.getByText(/2 séances d'affilée/).count()) > 0
  );

  // La cible ne doit PAS avoir bougé tant que rien n'est validé.
  let [row] = await rest("GET", `/exercises?select=target_weight_kg&id=eq.${ex.id}`);
  check("rien n'est écrit tant que le ✓ n'est pas touché", Number(row.target_weight_kg) === 60, String(row.target_weight_kg));

  // --- 3. Le ✗ mémorise le refus et ne repropose pas la même valeur
  await page.getByLabel(`Refuser la progression pour ${EX}`).click();
  await page.waitForTimeout(1500);
  [row] = await rest("GET", `/exercises?select=target_weight_kg,progression_declined_kg&id=eq.${ex.id}`);
  check("✗ : la cible reste inchangée", Number(row.target_weight_kg) === 60);
  check("✗ : le refus est mémorisé (62,5)", Number(row.progression_declined_kg) === 62.5, String(row.progression_declined_kg));

  await page.goto(`${BASE}/training/muscu?template=${tpl.id}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: TPL }).waitFor({ timeout: 15000 });
  check(
    "après refus, la même proposition ne revient pas",
    (await page.getByText("Nouveau", { exact: true }).count()) === 0
  );

  // --- 4. Le ✓ pose la cible, par le chemin partagé avec le MCP
  await rest("PATCH", `/exercises?id=eq.${ex.id}`, { progression_declined_kg: null });
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: TPL }).waitFor({ timeout: 15000 });
  await page.getByLabel(`${EX} : objectif et consignes`).click();
  await page.getByLabel(`Accepter la progression pour ${EX}`).click();
  await page.waitForTimeout(1500);
  [row] = await rest("GET", `/exercises?select=target_weight_kg,target_weight_note,progression_declined_kg&id=eq.${ex.id}`);
  check("✓ : la cible devient 62,5", Number(row.target_weight_kg) === 62.5, String(row.target_weight_kg));
  check("✓ : une note explique d'où vient la cible", Boolean(row.target_weight_note));
  check("✓ : le refus précédent est purgé", row.progression_declined_kg == null);

  // --- 5. La proposition disparaît une fois la cible atteinte
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: TPL }).waitFor({ timeout: 15000 });
  check(
    "cible relevée → plus de proposition (l'objectif n'est plus atteint)",
    (await page.getByText("Nouveau", { exact: true }).count()) === 0
  );
  // Et la case est pré-remplie à la NOUVELLE cible.
  check(
    "les cases suivent la nouvelle cible (62,5)",
    (await page.getByLabel(`${EX} série 1 poids`).inputValue()) === "62.5",
    await page.getByLabel(`${EX} série 1 poids`).inputValue()
  );
} finally {
  // Nettoyage vérifié : séances de test d'abord (les sets suivent en cascade).
  for (const d of [D1, D2]) {
    await rest("DELETE", `/workouts?workout_date=eq.${d}`).catch(() => {});
  }
  if (tplId) await rest("DELETE", `/template_exercises?template_id=eq.${tplId}`).catch(() => {});
  await deleteByNames("workout_templates", [TPL]);
  await deleteByNames("exercises", [EX]);
  await browser?.close();
  await cleanupNewDrafts(draftsBefore);
}
summary("progression proposée, acceptée, refusée (DOM)");
