// Objectif d'un exercice pour la séance du jour (Lot 19).
//
// L'app ASSEMBLE l'objectif à partir de trois sources DÉJÀ en base — elle
// n'invente aucune progression (décision Lot 14 : « aucun calcul de cible
// dans l'app ») :
//   - le TEMPLATE donne le nombre de séries et la fourchette de reps
//   - la CIBLE de poids (exercises.target_weight_kg) est posée par Claude,
//     SIGNÉE depuis le Lot 26 : négatif = assistance (AMENDEMENT 3)
//   - la DERNIÈRE PERF sert de repli quand il n'y a pas de cible
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
    return { load: null, reps: reps.length ? Math.max(...reps) : null, assist: false };
  }
  // La difficulté est ordonnée par le poids SIGNÉ : -14 (assisté) < 0 (poids du
  // corps) < +5 (lesté). Un simple max le capture, y compris à la transition
  // assistance → lest. Déduire l'assistance d'un `some(w < 0)` sur toute la
  // séance inverserait le signe le jour où la première série lestée arrive :
  // [8@-10, 5@-10, 4@+5] serait lu « assisté », le min des valeurs absolues
  // désignerait la série LESTÉE comme la moins assistée, et les 4 reps à +5 kg
  // repartiraient en base à -5 kg.
  const signed = Math.max(...loaded.map((s) => s.w));
  // Reps tenues À cette charge : le haut de fourchette se juge sur la série de
  // travail, pas sur un échauffement plus léger.
  const atLoad = loaded
    .filter((s) => s.w === signed && s.reps != null)
    .map((s) => s.reps);
  return {
    load: Math.abs(signed),
    reps: atLoad.length ? Math.max(...atLoad) : null,
    assist: signed < 0,
  };
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
  const { reps: doneReps, load: doneLoad, assist: doneAssist } = workingSet(done);

  // Lot 26 : la cible est SIGNÉE, comme workout_sets.weight_kg (AMENDEMENT 3) —
  // négatif = assistance. Avant, set_exercise_target imposait > 0 : le signe
  // n'existait nulle part et l'app devait le déduire d'une charge déjà
  // enregistrée. Sur un exercice au poids du corps sans historique chargé, une
  // cible « assistance 14 » arrivait donc comme +14 sous un en-tête « poids
  // (kg) » — soit 14 kg LESTÉS enregistrés pour une séance assistée, validables
  // d'un tap. La magnitude et la convention voyagent maintenant ensemble.
  const targetSigned = num(targetWeight);
  const doneSigned = doneLoad == null ? null : doneAssist ? -doneLoad : doneLoad;
  const signed = targetSigned ?? doneSigned;
  const weight = signed == null ? null : Math.abs(signed);
  const assist = signed == null ? doneAssist : signed < 0;

  const min = num(d.repsMin);
  const max = num(d.repsMax);
  // La difficulté est ordonnée par le poids SIGNÉ : -14 (assisté) < 0 < +5
  // (lesté). Une seule comparaison couvre donc les deux conventions, y compris
  // la transition assistance → lest ; « moins d'aide » (-14 → -12) est bien lu
  // comme plus dur.
  const heavier = signed != null && doneSigned != null && signed > doneSigned;

  // La charge monte → bas de fourchette ; sinon → au moins la dernière fois.
  // Le plafond s'applique dans LES DEUX cas : sans `default_reps_min` (colonne
  // nullable), la branche « ça monte » retombait sur les reps de la dernière
  // fois SANS plafond, et proposait « 4×12 @ 70 kg » là où le template plafonne
  // à 6 — l'extrapolation que ce module s'interdit, et pire au moment le plus
  // dur.
  let reps = heavier ? (min ?? doneReps) : (doneReps ?? min);
  if (reps != null && max != null) reps = Math.min(reps, max);

  return {
    // Un template à 0 série afficherait « 0×6 » alors que targetRows en rend 1.
    sets: Math.max(1, num(d.sets) ?? (done.length || 3)),
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
