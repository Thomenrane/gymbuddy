// Lot 14 — DOM : la cible de poids posée par Claude est bien portée par
// l'écran séance, distincte du dernier poids fait.
//
// RÉVISÉ AU LOT 19 (décision PO, pas un affaiblissement) : les mêmes faits
// sont vérifiés à leur NOUVEL emplacement.
//   - le flux ne garde QU'UNE ligne de contexte (« Dernière ») ; « Poids
//     cible », la fourchette et le RPE cible sont derrière le ⓘ
//   - le champ poids est désormais pré-rempli à l'OBJECTIF (la cible), plus au
//     dernier poids fait : le PO veut viser, pas recopier
// Ce que le Lot 14 garantissait reste garanti : la cible existe, elle est
// affichée, elle reste distincte du dernier fait.
import { authedBrowser, rest, check, summary, BASE, draftIdsNow, cleanupNewDrafts } from "./lib.mjs";

const CIBLE = 67.5;
const NOTE = "test cible L14";

async function getTemplate() {
  const tpls = await rest(
    "GET",
    "workout_templates?is_active=eq.true&select=id,name,template_exercises(position,target_rpe,exercise_id,exercise:exercises(id,name,target_weight_kg,target_weight_note))"
  );
  for (const t of tpls) {
    const exos = (t.template_exercises ?? [])
      .filter((te) => te.exercise && te.target_rpe != null)
      .sort((a, b) => a.position - b.position);
    if (exos.length >= 2) return { id: t.id, exos };
  }
  throw new Error("aucun template actif avec ≥2 exercices à target_rpe");
}

let browser;
let restore = null;
// Lot 27 : ouvrir l'écran séance crée une ligne « En cours » en base — on note
// les brouillons existants pour ne supprimer que ceux que CE test aura créés.
const draftsBefore = await draftIdsNow();
try {
  const { id: tplId, exos } = await getTemplate();
  const withTarget = exos[0].exercise;
  const noTarget = exos[1].exercise;
  // Mémorise les cibles d'origine pour restauration.
  restore = [
    { id: withTarget.id, w: withTarget.target_weight_kg, n: withTarget.target_weight_note },
    { id: noTarget.id, w: noTarget.target_weight_kg, n: noTarget.target_weight_note },
  ];
  // Pose une cible sur le 1er exo, garantit l'absence de cible sur le 2e.
  await rest("PATCH", `exercises?id=eq.${withTarget.id}`, { target_weight_kg: CIBLE, target_weight_note: NOTE });
  await rest("PATCH", `exercises?id=eq.${noTarget.id}`, { target_weight_kg: null, target_weight_note: null });

  const { browser: b, page } = await authedBrowser();
  browser = b;
  await page.goto(`${BASE}/training/muscu?template=${tplId}&date=1999-12-20`, { waitUntil: "networkidle" });

  const sectionOf = (name) =>
    page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name, exact: true }) });

  const sWith = sectionOf(withTarget.name);
  const sNo = sectionOf(noTarget.name);
  check("section de l'exo avec cible rendue", (await sWith.count()) === 1, withTarget.name);
  check("section de l'exo sans cible rendue", (await sNo.count()) === 1, noTarget.name);

  // Flux : UNE seule ligne de contexte, les consignes sont repliées (Lot 19).
  check("exo avec cible : ligne « Dernière » dans le flux", await sWith.getByText(/Dernière\s*:/).count() > 0);
  check("exo avec cible : « Poids cible » hors du flux (replié)", (await sWith.getByText(/Poids cible/).count()) === 0);
  check("exo avec cible : « Cible : » hors du flux (replié)", (await sWith.getByText(/Cible\s*:/).count()) === 0);
  check("exo avec cible : note longue de Claude hors du flux", (await sWith.getByText(NOTE).count()) === 0);

  // ⓘ : la cible, la fourchette, le RPE cible et la note s'y retrouvent.
  await sWith.getByLabel(`${withTarget.name} : objectif et consignes`).click();
  check("ⓘ : objectif chiffré affiché", await sWith.getByText(/Objectif\s*:/).count() > 0);
  check("ⓘ : cible 67.5 kg retrouvée", await sWith.getByText(/67\.5 kg/).count() > 0);
  check("ⓘ : RPE cible du template retrouvé", await sWith.getByText(/RPE\s*\d/).count() > 0);
  check("ⓘ : note de la cible retrouvée", await sWith.getByText(NOTE).count() > 0);

  // Exo SANS cible : pas de poids cible, même une fois le détail déplié.
  check("exo sans cible : ligne « Dernière » présente", await sNo.getByText(/Dernière\s*:/).count() > 0);
  await sNo.getByLabel(`${noTarget.name} : objectif et consignes`).click();
  check("exo sans cible : PAS de « Poids cible » même déplié", (await sNo.getByText(/Poids cible/).count()) === 0);

  // Lot 19 : le champ poids porte l'OBJECTIF (la cible), plus le dernier fait.
  const weightInput = page.locator(`input[aria-label="${withTarget.name} série 1 poids"]`).first();
  const val = await weightInput.inputValue();
  check("champ poids pré-rempli non vide", val.trim() !== "");
  check("champ poids = cible (67.5) — objectif dans les cases", val.trim() === String(CIBLE), val);
} catch (e) {
  console.error("  FAIL", e.message);
  process.exitCode = 1;
} finally {
  for (const r of restore ?? []) {
    await rest("PATCH", `exercises?id=eq.${r.id}`, {
      target_weight_kg: r.w ?? null,
      target_weight_note: r.n ?? null,
    }).catch(() => {});
  }
  await browser?.close();
  // Après la fermeture SEULEMENT : un autosave encore en vol recréerait
  // sinon la ligne « En cours » juste après sa suppression.
  await cleanupNewDrafts(draftsBefore);
}
process.exit(summary("séance cible de poids (DOM)") ? process.exitCode ?? 0 : 1);
