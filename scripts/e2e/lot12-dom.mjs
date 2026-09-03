// Lot 12 — DOM : l'écran séance rendu (auth réelle) expose un champ RPE
// optionnel PAR SÉRIE qui ne bloque JAMAIS la validation quand il est vide.
// On rend une séance depuis un template, on vérifie les champs RPE (vides par
// défaut), puis on enregistre la séance AVEC les RPE laissés vides et on
// confirme en base que les sets sont stockés avec rpe = null. Nettoyage.
import { authedBrowser, rest, check, summary, BASE, draftIdsNow, cleanupNewDrafts } from "./lib.mjs";

const DTEST = "1999-12-14";

async function cleanup() {
  await rest("DELETE", `workouts?workout_date=eq.${DTEST}`).catch(() => {});
}

let browser;
// Lot 27 : ouvrir l'écran séance crée une ligne « En cours » en base — on note
// les brouillons existants pour ne supprimer que ceux que CE test aura créés.
const draftsBefore = await draftIdsNow();
try {
  await cleanup();
  // Un template actif avec au moins un exercice → sets pré-remplis à rendre.
  const templates = await rest(
    "GET",
    "workout_templates?is_active=eq.true&select=id,template_exercises(id)&limit=20"
  );
  const tpl = templates.find((t) => (t.template_exercises ?? []).length > 0);
  if (!tpl) throw new Error("aucun template actif avec exercices");

  const { browser: b, page } = await authedBrowser();
  browser = b;
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}&date=${DTEST}`, {
    waitUntil: "networkidle",
  });

  // Lot 19 (décision PO) : la colonne RPE est MASQUÉE par défaut — un tiers de
  // la largeur pour un champ rarement rempli. Le champ n'a pas disparu : on
  // l'affiche via la préférence, puis tout le contrat du Lot 12 est revérifié
  // à l'identique (présent par série, vide par défaut, jamais bloquant).
  check(
    "Lot 19 : colonne RPE masquée par défaut",
    (await page.getByLabel(/RPE ressenti/i).count()) === 0
  );
  await page.getByLabel("Aide : double progression, RPE, affichage").click();
  await page.getByRole("switch", { name: "Afficher la colonne RPE" }).click();
  await page.getByRole("button", { name: "Fermer" }).first().click();

  const rpeInputs = page.getByLabel(/RPE ressenti/i);
  const count = await rpeInputs.count();
  check("champ RPE optionnel présent par série", count >= 1, `trouvés: ${count}`);
  check("RPE vide par défaut", (await rpeInputs.first().inputValue()) === "");

  const finish = page.getByRole("button", { name: /Terminer la séance/i });
  check(
    "bouton « Terminer la séance » activé malgré RPE vide (non bloquant)",
    !(await finish.first().isDisabled())
  );

  // Enregistrement bout-en-bout avec TOUS les RPE laissés vides.
  await finish.first().click();
  await page.getByRole("button", { name: /^Enregistrer$/ }).click();
  await page
    .waitForURL(/\/training\/[0-9a-f-]{36}/, { timeout: 20000 })
    .catch(() => {});

  const saved = await rest(
    "GET",
    `workouts?workout_date=eq.${DTEST}&select=id,workout_sets(rpe,reps)`
  );
  const allSets = (saved ?? []).flatMap((w) => w.workout_sets ?? []);
  check("séance enregistrée avec RPE vide (validation non bloquée)", (saved ?? []).length === 1 && allSets.length >= 1);
  check("les séries sont stockées avec rpe = null", allSets.length > 0 && allSets.every((s) => s.rpe === null));
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
process.exit(summary("séance RPE (DOM)") ? process.exitCode ?? 0 : 1);
