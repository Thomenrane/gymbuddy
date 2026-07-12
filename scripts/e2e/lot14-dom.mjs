// Lot 14 — DOM : l'écran séance rendu (auth réelle) affiche, pour un exo AYANT
// une cible de poids, à la fois « Dernière fois » ET « Poids cible » ET le RPE
// cible du template ; pour un exo SANS cible, seulement « Dernière fois ». Et
// le champ poids réel reste pré-rempli au dernier poids fait (pas la cible).
import { authedBrowser, rest, check, summary, BASE } from "./lib.mjs";

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

  // Exo AVEC cible : dernier fait + poids cible + RPE cible.
  check("exo avec cible : « Dernière fois » présent", await sWith.getByText(/Dernière fois/).count() > 0);
  check("exo avec cible : « Poids cible : 67.5 kg » présent", await sWith.getByText(/Poids cible : 67\.5 kg/).count() > 0);
  check("exo avec cible : RPE cible du template présent", await sWith.getByText(/RPE\s*\d/).count() > 0);

  // Exo SANS cible : dernier fait seulement, pas de poids cible.
  check("exo sans cible : « Dernière fois » présent", await sNo.getByText(/Dernière fois/).count() > 0);
  check("exo sans cible : PAS de « Poids cible »", (await sNo.getByText(/Poids cible/).count()) === 0);

  // Le champ poids réel reste pré-rempli au DERNIER poids fait (pas la cible).
  const weightInput = page.locator(`input[aria-label="${withTarget.name} série 1 poids"]`).first();
  const val = await weightInput.inputValue();
  check("champ poids pré-rempli non vide (dernier poids fait)", val.trim() !== "");
  check("champ poids ≠ cible (67.5) — la cible n'est pas imposée", val.trim() !== String(CIBLE));
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
}
process.exit(summary("séance cible de poids (DOM)") ? process.exitCode ?? 0 : 1);
