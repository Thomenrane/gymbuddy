// Lot 27 — DOM : une séance commencée puis quittée est visible et reprenable.
//
// Demande PO : « quand je quitte une session en cours elle apparaît toujours
// nulle part — je devrais pouvoir la voir en "En cours" sur la page Training,
// au même emplacement qu'une session terminée → je dois pouvoir cliquer dessus
// et revenir pour continuer ma séance ».
//
// Ce test refait le geste qui échouait : ouvrir une séance, NE RIEN MODIFIER
// (les cases sont pré-remplies à l'objectif depuis le Lot 19 — c'est
// exactement le cas que l'ancien drapeau `dirty` laissait passer), repartir, et
// exiger que la séance soit là.
import { authedBrowser, check, summary, rest, BASE, deleteByNames, draftIdsNow, cleanupNewDrafts } from "./lib.mjs";

const TPL = "__ENCOURS_TPL__";
const EX = "__ENCOURS_EX__";

let browser;
let templateId;
// Lot 27 : ouvrir l'écran séance crée une ligne « En cours » en base — on note
// les brouillons existants pour ne supprimer que ceux que CE test aura créés.
const draftsBefore = await draftIdsNow();
try {
  // --- Seed : un template à un exercice, pour ne dépendre d'aucune donnée réelle
  const [ex] = await rest("POST", "/exercises", { name: EX, measure_type: "reps" });
  const [tpl] = await rest("POST", "/workout_templates", {
    name: TPL,
    type: "muscu",
    is_active: true,
  });
  templateId = tpl.id;
  await rest("POST", "/template_exercises", {
    template_id: tpl.id,
    exercise_id: ex.id,
    position: 1,
    default_sets: 3,
    default_reps_min: 6,
    default_reps_max: 8,
  });

  const { browser: b, page } = await authedBrowser();
  browser = b;

  // --- 1. Aucune séance en cours au départ
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Training", exact: true }).waitFor({ timeout: 15000 });
  const before = await page.getByText("En cours", { exact: true }).count();
  check("état initial : aucune séance en cours", before === 0, String(before));

  // --- 2. Ouvrir la séance et REPARTIR SANS RIEN TOUCHER
  await page.goto(`${BASE}/training/muscu?template=${tpl.id}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: TPL }).waitFor({ timeout: 15000 });
  check("séance ouverte, cases pré-remplies", (await page.locator("input").count()) > 0);
  // Le brouillon s'écrit en différé (débounce) : on laisse le temps à l'action
  // serveur de partir avant de quitter la page.
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Training", exact: true }).waitFor({ timeout: 15000 });

  const badge = page.getByText("En cours", { exact: true });
  check(
    "séance quittée SANS modification → visible « En cours »",
    (await badge.count()) === 1,
    `${await badge.count()} badge(s)`
  );
  check("la ligne porte le nom du template", (await page.getByText(TPL).count()) >= 1);

  // --- 3. Un tap dessus ramène dans la séance
  await page.getByText(TPL).first().click();
  await page.waitForURL(/\/training\/muscu\?draft=/, { timeout: 15000 });
  check("le tap ramène dans la séance (?draft=)", /draft=/.test(page.url()), page.url());
  await page.getByRole("heading", { name: TPL }).waitFor({ timeout: 15000 });

  // --- 4. La saisie faite à la reprise est conservée
  const firstInput = page.locator("input").first();
  await firstInput.fill("7");
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.getByText(TPL).first().click();
  await page.waitForURL(/draft=/, { timeout: 15000 });
  await page.getByRole("heading", { name: TPL }).waitFor({ timeout: 15000 });
  check(
    "la saisie survit à un aller-retour",
    (await page.locator("input").first().inputValue()) === "7",
    await page.locator("input").first().inputValue()
  );

  // --- 4bis. Frappes rapprochées : la DERNIÈRE gagne, et une seule ligne
  //
  // Le premier jet perdait cette saisie : une frappe arrivant pendant une
  // écriture en vol posait un drapeau « à refaire » que la fin de l'écriture
  // n'honorait pas (l'effet qui l'avait lancée venait d'être nettoyé par cette
  // frappe même). Et l'id revenu était jeté dans ce cas, ce qui faisait créer
  // une SECONDE ligne « En cours » pour la même séance.
  const inputs = page.locator("input");
  for (const v of ["8", "9", "10"]) {
    await inputs.first().fill(v);
    await page.waitForTimeout(400); // sous le débounce : les écritures se chevauchent
  }
  await page.waitForTimeout(3000);
  const afterBurst = await rest(
    "GET",
    `/workout_drafts?select=id,payload&title=eq.${encodeURIComponent(TPL)}`
  );
  check(
    "frappes rapprochées → toujours UNE seule ligne « En cours »",
    afterBurst.length === 1,
    `${afterBurst.length} ligne(s)`
  );
  const savedReps = afterBurst[0]?.payload?.exercises?.[0]?.sets?.[0]?.reps;
  check(
    "frappes rapprochées → la DERNIÈRE saisie est bien celle enregistrée",
    String(savedReps) === "10",
    `en base : ${savedReps}`
  );

  // --- 4ter. Quitter l'écran pendant le débounce ne perd pas la frappe
  //
  // Navigation INTERNE (l'onglet Training), pas un page.goto : c'est ainsi
  // qu'on quitte une séance dans l'app, et c'est le seul cas où React démonte
  // le composant et peut donc écrire avant de partir. Un rechargement dur ou
  // une app tuée par l'OS restent hors de portée — au pire 1,2 s de frappe.
  await inputs.first().fill("11");
  await page.getByRole("link", { name: "Training" }).click();
  await page.waitForURL(/\/training(\?|$)/, { timeout: 15000 });
  await page.waitForTimeout(2000);
  const afterLeave = await rest(
    "GET",
    `/workout_drafts?select=payload&title=eq.${encodeURIComponent(TPL)}`
  );
  check(
    "quitter juste après avoir tapé → la frappe est quand même enregistrée",
    String(afterLeave[0]?.payload?.exercises?.[0]?.sets?.[0]?.reps) === "11",
    `en base : ${afterLeave[0]?.payload?.exercises?.[0]?.sets?.[0]?.reps}`
  );

  // --- 5. Un seul brouillon, pas un par frappe
  const drafts = await rest("GET", `/workout_drafts?select=id,title&title=eq.${encodeURIComponent(TPL)}`);
  check("une seule ligne « En cours » pour une séance", drafts.length === 1, `${drafts.length} ligne(s)`);

  // --- 6. Rien n'a fui dans les séances réelles
  const leaked = await rest("GET", `/workouts?select=id&template_id=eq.${tpl.id}`);
  check(
    "une séance en cours n'entre PAS dans workouts (stats intactes)",
    leaked.length === 0,
    `${leaked.length} séance(s)`
  );

  // --- 7. « Abandonner » la fait disparaître
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Training", exact: true }).waitFor({ timeout: 15000 });
  await page.getByLabel(`Abandonner ${TPL}`).click();
  await page.waitForTimeout(1500);
  const left = await rest("GET", `/workout_drafts?select=id&title=eq.${encodeURIComponent(TPL)}`);
  check("« Abandonner » supprime la ligne", left.length === 0, `${left.length} restante(s)`);
} finally {
  // Nettoyage VÉRIFIÉ (le nettoyage silencieux du Lot 22 laissait des données
  // de test dans la vraie base pendant des jours).
  if (templateId) {
    await rest("DELETE", `/workout_drafts?template_id=eq.${templateId}`).catch(() => {});
    await rest("DELETE", `/template_exercises?template_id=eq.${templateId}`).catch(() => {});
  }
  await deleteByNames("workout_templates", [TPL]);
  await deleteByNames("exercises", [EX]);
  await browser?.close();
  // Après la fermeture SEULEMENT : un autosave encore en vol recréerait
  // sinon la ligne « En cours » juste après sa suppression.
  await cleanupNewDrafts(draftsBefore);
}
summary("séance en cours visible et reprenable (DOM)");
