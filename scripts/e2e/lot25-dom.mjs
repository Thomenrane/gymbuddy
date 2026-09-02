// Lot 25 — DOM : cohérence de lecture.
//
//   1. le RPE saisi en séance (Lot 12) se retrouve sur la fiche séance — il
//      était stocké et jamais réaffiché
//   2. la « dernière fois » reste juste quel que soit le chemin actif (RPC
//      latest_sets_by_exercise si la migration est appliquée, ancienne requête
//      sinon) : c'est ce qui rend le repli sûr
import { authedBrowser, rest, check, summary, BASE, deleteByNames } from "./lib.mjs";

const D_HIST = "1999-12-24";
const D_SESS = "1999-12-25";
const EXO = "__RELECTURE_DOM__";

async function cleanup() {
  for (const d of [D_HIST, D_SESS]) {
    await rest("DELETE", `workouts?workout_date=eq.${d}`).catch(() => {});
  }
  await deleteByNames("workout_templates", ["__RELECTURE_TPL__"]);
  await deleteByNames("exercises", [EXO]);
}

let browser;
try {
  await cleanup();
  const [exo] = await rest("POST", "exercises", { name: EXO, measure_type: "reps" });
  const [hist] = await rest("POST", "workouts", { workout_date: D_HIST, type: "muscu" });
  await rest(
    "POST",
    "workout_sets",
    [1, 2, 3].map((n) => ({
      workout_id: hist.id,
      exercise_id: exo.id,
      position: 0,
      set_number: n,
      reps: 7,
      weight_kg: 52.5,
    }))
  );
  const [tpl] = await rest("POST", "workout_templates", {
    name: "__RELECTURE_TPL__",
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
  });

  const { browser: b, page } = await authedBrowser();
  browser = b;
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}&date=${D_SESS}`, {
    waitUntil: "networkidle",
  });

  // --- 1. « Dernière fois » juste, quel que soit le chemin de lecture ---
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: EXO, exact: true }) });
  check("ligne « Dernière : 3×7 @ 52.5 kg »",
    (await section.getByText(/Dernière\s*:\s*3×7 @ 52\.5 kg/).count()) > 0,
    await section.innerText());
  check("cases pré-remplies depuis cette dernière perf",
    (await page.getByLabel(`${EXO} série 1 poids`).inputValue()) === "52.5");

  // --- 2. Un RPE saisi doit se retrouver sur la fiche ---
  await page.getByLabel("Aide : double progression, RPE, affichage").click();
  await page.getByRole("switch", { name: "Afficher la colonne RPE" }).click();
  await page.getByRole("button", { name: "Fermer" }).first().click();
  await page.getByLabel(`${EXO} série 1 RPE ressenti (optionnel)`).fill("9");

  await page.getByRole("button", { name: "Terminer la séance" }).click();
  await page.getByRole("button", { name: /^Enregistrer$/ }).click();
  await page.waitForURL(/\/training\/[0-9a-f-]{36}/, { timeout: 20000 });

  check("fiche séance : RPE 9 affiché", (await page.getByText(/RPE 9/).count()) > 0, await page.innerText("main"));
  check("séries sans RPE : aucun « RPE » parasite",
    (await page.getByText(/RPE (null|undefined|\?)/).count()) === 0);

  const saved = await rest("GET", `workouts?workout_date=eq.${D_SESS}&select=workout_sets(set_number,rpe)`);
  const sets = (saved ?? []).flatMap((w) => w.workout_sets ?? []);
  check("en base : une seule série porte le RPE",
    sets.filter((s) => s.rpe === 9).length === 1 && sets.filter((s) => s.rpe === null).length === 2,
    JSON.stringify(sets));
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  await browser?.close();
}
process.exit(summary("cohérence de lecture (DOM)") ? process.exitCode ?? 0 : 1);
