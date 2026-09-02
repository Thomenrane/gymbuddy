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

/** Reps de référence de la dernière perf : le MAX des séries connues. */
function lastReps(sets) {
  const vals = sets.map((s) => num(s.reps)).filter((n) => n != null);
  return vals.length ? Math.max(...vals) : null;
}

/**
 * Charge de référence de la dernière perf, en VALEUR ABSOLUE (la première
 * série porte la charge de travail ; null = poids du corps).
 */
function lastLoad(sets) {
  const vals = sets.map((s) => num(s.weight_kg)).filter((n) => n != null);
  return vals.length ? Math.abs(vals[0]) : null;
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

  const doneReps = lastReps(done);
  const doneLoad = lastLoad(done);
  const target = num(targetWeight);
  const weight = target != null ? Math.abs(target) : doneLoad;

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
