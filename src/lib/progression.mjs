// Progression automatique de charge (Lot 29).
//
// Demande PO : « si j'atteins l'objectif 2× d'affilée, la fois d'après j'ai un
// nouvel objectif de charge qui propose une charge plus élevée selon une
// progression logique ».
//
// L'app ne DÉCIDE pas : elle propose, le PO accepte (✓) ou refuse (✗). C'est la
// nuance qui rend le calcul acceptable ici alors que le Lot 14 interdisait tout
// calcul de cible dans l'app — la cible reste posée par un geste explicite.
//
// Tout est en poids SIGNÉ (Lot 26) : positif = charge ajoutée, négatif =
// assistance. Une seule addition couvre donc les deux mondes — progresser,
// c'est TOUJOURS augmenter le signé : 72,5 → 75 comme -14 → -12 (moins d'aide).
//
// Module JS pur (aucun accès DB, aucun React) : testé par
// scripts/progression.test.mjs.

/** Pas par défaut quand l'exercice n'en déclare pas : le plus petit disque. */
export const DEFAULT_STEP_KG = 2.5;

/** Nombre de séances réussies d'affilée avant de proposer (demande PO : 2). */
export const STREAK_REQUIRED = 2;

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

/**
 * Une séance a-t-elle ATTEINT l'objectif pour cet exercice ?
 *
 * Trois conditions, toutes nécessaires :
 *   - toutes les séries travaillées au HAUT de fourchette (double progression) ;
 *   - au poids visé au moins (en signé : -12 ≥ -14 veut dire moins assisté) ;
 *   - RPE ≤ cible LÀ OÙ il est saisi (le RPE reste optionnel : son absence ne
 *     doit ni bloquer la progression, ni la déclencher toute seule).
 *
 * Les séries sans poids ET sans reps sont ignorées (ligne vide). Une séance
 * sans aucune série exploitable n'est pas « atteinte » : on ne progresse pas
 * sur du vide.
 */
export function reachedObjective(sets, { repsMax, signedTarget, targetRpe } = {}) {
  const max = num(repsMax);
  const target = num(signedTarget);
  const rpeMax = num(targetRpe);
  // Sans haut de fourchette, « atteindre l'objectif » n'a pas de définition :
  // on s'abstient plutôt que d'inventer un seuil.
  if (max == null) return false;

  const working = (sets ?? [])
    .map((s) => ({ reps: num(s.reps), w: num(s.weight_kg), rpe: num(s.rpe) }))
    .filter((s) => s.reps != null || s.w != null);
  if (working.length === 0) return false;

  for (const s of working) {
    if (s.reps == null || s.reps < max) return false;
    if (target != null && (s.w == null || s.w < target)) return false;
    if (rpeMax != null && s.rpe != null && s.rpe > rpeMax) return false;
  }
  return true;
}

/**
 * Faut-il proposer une nouvelle cible ?
 *
 * @param {{
 *   sessions?: Array<{sets: Array<{reps: number|null, weight_kg: number|null, rpe: number|null}>}>,
 *   defaults?: {repsMax?: number|null, targetRpe?: number|null}|null,
 *   signedTarget?: number|null,
 *   step?: number|null,
 *   declined?: number|null,
 * }} input `sessions` de la plus RÉCENTE à la plus ancienne.
 * @returns {{from: number, to: number, step: number}|null}
 */
export function suggestNextTarget({
  sessions,
  defaults,
  signedTarget,
  step,
  declined,
} = {}) {
  const target = num(signedTarget);
  // Sans cible, il n'y a rien à incrémenter : proposer « le dernier poids + 2,5 »
  // reviendrait à inventer une cible que personne n'a posée — exactement ce que
  // le Lot 14 interdit à l'app.
  if (target == null) return null;

  const recent = (sessions ?? []).slice(0, STREAK_REQUIRED);
  if (recent.length < STREAK_REQUIRED) return null;

  const d = defaults ?? {};
  const allReached = recent.every((s) =>
    reachedObjective(s?.sets, {
      repsMax: d.repsMax,
      signedTarget: target,
      targetRpe: d.targetRpe,
    })
  );
  if (!allReached) return null;

  const inc = num(step);
  const useStep = inc != null && inc > 0 ? inc : DEFAULT_STEP_KG;
  // Poids signé : +step veut dire « plus dur » des deux côtés (plus de charge,
  // ou moins d'assistance).
  const to = round2(target + useStep);
  // Une assistance qui franchit zéro deviendrait un lest sans que personne ne
  // l'ait décidé : on s'arrête au poids du corps et on laisse le PO trancher.
  if (target < 0 && to > 0) return null;
  const no = num(declined);
  if (no != null && no === to) return null;
  return { from: target, to, step: useStep };
}

/** Deux décimales : 67.5 + 2.5 = 70, pas 69.99999999999999. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Libellé de la proposition — « 72,5 → 75 kg », « assist. 14 → 12 kg ».
 * Null si rien à proposer.
 */
export function formatSuggestion(s) {
  if (!s) return null;
  const fmt = (n) => String(Math.abs(n)).replace(".", ",");
  if (s.from < 0) return `assist. ${fmt(s.from)} → ${fmt(s.to)} kg`;
  return `${fmt(s.from)} → ${fmt(s.to)} kg`;
}
