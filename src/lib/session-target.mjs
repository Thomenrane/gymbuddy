// Objectif d'un exercice pour la séance du jour (Lot 19).
//
// L'app ASSEMBLE l'objectif à partir de trois sources DÉJÀ en base — elle
// n'invente aucune progression (décision Lot 14 : « aucun calcul de cible
// dans l'app ») :
//   - le TEMPLATE donne le nombre de séries et la fourchette de reps
//   - la CIBLE de poids (exercises.target_weight_kg) est posée par Claude
//   - la DERNIÈRE PERF sert de repli, et donne le signe (poids négatif =
//     assistance, AMENDEMENT 3)
//
// Règle de reps (double progression, sans extrapolation) :
//   - la charge MONTE (cible > dernier poids ; en assistance, MOINS d'aide =
//     plus dur) → on repart en BAS de fourchette
//   - sinon → on refait au moins les reps de la dernière fois, CAPÉES au haut
//     de la fourchette. Le « +1 rep », c'est le PO qui le fait, pas l'app.
//
// Module JS pur (aucun accès DB, aucun React) : testé directement par
// scripts/session-target.test.mjs.
import { formatWeight } from "./last-sets.mjs";

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

/**
 * Série de travail de la dernière perf : celle qui porte la charge la plus
 * DURE. En assistance (poids négatif) la plus dure est la moins assistée.
 *
 * Prendre le poids d'une série et les reps d'une autre — par exemple le poids
 * de la 1re et le max des reps — fabriquerait une combinaison jamais réalisée :
 * après un échauffement 60×8 / 70×6 / 80×4, l'objectif afficherait « 8 @ 60 »
 * pendant que la ligne « Dernière » montre le détail réel juste au-dessus.
 */
function workingSet(sets) {
  const loaded = sets
    .map((s) => ({ reps: num(s.reps), w: num(s.weight_kg) }))
    .filter((s) => s.w != null);
  if (loaded.length === 0) {
    const reps = sets.map((s) => num(s.reps)).filter((n) => n != null);
    return { load: null, reps: reps.length ? Math.max(...reps) : null };
  }
  const assist = loaded.some((s) => s.w < 0);
  const load = assist
    ? Math.min(...loaded.map((s) => Math.abs(s.w)))
    : Math.max(...loaded.map((s) => Math.abs(s.w)));
  // Reps tenues À cette charge : le haut de fourchette se juge sur la série de
  // travail, pas sur un échauffement plus léger.
  const atLoad = loaded
    .filter((s) => Math.abs(s.w) === load && s.reps != null)
    .map((s) => s.reps);
  return { load, reps: atLoad.length ? Math.max(...atLoad) : null };
}

/**
 * @param {{
 *   defaults?: {sets?: number|null, repsMin?: number|null, repsMax?: number|null}|null,
 *   targetWeight?: number|string|null,
 *   last?: {sets: Array<{reps: number|null, weight_kg: number|null}>}|null,
 * }} input
 * @returns {{sets: number, reps: number|null, weight: number|null, assist: boolean}}
 *   `weight` est TOUJOURS positif ; `assist` porte la convention du signe.
 */
export function sessionTarget({ defaults, targetWeight, last } = {}) {
  const d = defaults ?? {};
  const done = last?.sets ?? [];
  const assist = done.some((s) => {
    const w = num(s.weight_kg);
    return w != null && w < 0;
  });

  const { reps: doneReps, load: doneLoad } = workingSet(done);
  const target = num(targetWeight);

  // Le SIGNE (charge ajoutée ou assistance) n'est nulle part dans la cible :
  // set_exercise_target impose target_weight_kg > 0, Claude l'écrit donc en
  // prose (« ASSISTANCE 14 kg (soit -14) »). Il ne peut être déduit que d'une
  // charge déjà enregistrée. Sans historique chargé, on connaît la magnitude
  // mais PAS la convention : pré-remplir « 14 » dans une case dont l'en-tête
  // dit « poids (kg) » ferait enregistrer +14 kg lestés pour une séance
  // assistée — le pré-remplissage rend l'erreur invisible et validable d'un
  // tap. On laisse donc la case vide et la cible s'affiche derrière le ⓘ.
  const signKnown = doneLoad != null;
  const weight = target != null ? (signKnown ? Math.abs(target) : null) : doneLoad;

  const min = num(d.repsMin);
  const max = num(d.repsMax);
  // En assistance, une cible PLUS BASSE que la dernière fois est plus dure.
  const heavier =
    weight != null &&
    doneLoad != null &&
    (assist ? weight < doneLoad : weight > doneLoad);

  let reps;
  if (heavier) {
    reps = min ?? doneReps;
  } else {
    reps = doneReps ?? min;
    if (reps != null && max != null) reps = Math.min(reps, max);
  }

  return {
    sets: num(d.sets) ?? (done.length || 3),
    reps,
    weight,
    assist,
  };
}

/**
 * Libellé compact de l'objectif — « 4×6 @ 67.5 kg », « 4×6 @ assist. 14 kg ».
 * Null si on n'a rien à viser (ni template ni historique).
 *
 * Charge inconnue → « 4×6 » tout court : `weight = null` couvre AUSSI BIEN le
 * poids du corps qu'un exercice jamais chargé, donc afficher « PDC » ici
 * mentirait une fois sur deux. La ligne « Dernière » porte déjà l'info quand
 * l'exercice est réellement au poids du corps.
 */
export function formatTarget(target) {
  if (!target || target.reps == null) return null;
  const head = `${target.sets}×${target.reps}`;
  if (target.weight == null) return head;
  return `${head} @ ${formatWeight(target.assist ? -target.weight : target.weight)}`;
}

/**
 * L'objectif transformé en lignes de saisie pré-remplies (PO : « je veux que
 * l'exo soit pré-rempli par objectif »). Valeurs vides quand on ne sait pas —
 * jamais de chiffre inventé.
 */
export function targetRows(target) {
  const count = Math.max(1, target?.sets ?? 3);
  return Array.from({ length: count }, () => ({
    reps: target?.reps == null ? "" : String(target.reps),
    weight: target?.weight == null ? "" : String(target.weight),
    rpe: "",
  }));
}
