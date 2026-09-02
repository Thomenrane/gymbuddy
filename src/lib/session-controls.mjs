// Aides de saisie et de chrono de l'écran séance (Lot 24).
//
// Module JS pur : testé directement par scripts/session-controls.test.mjs.

/**
 * Incrémente une case de saisie (reps ±1, poids ±2,5) sans jamais produire de
 * valeur absurde.
 *
 * - la virgule décimale est acceptée (clavier français), la sortie utilise le
 *   point, comme le reste de l'app
 * - une case vide qu'on DÉCRÉMENTE reste vide : il n'y a rien à réduire, et
 *   « 0 » serait une donnée fausse enregistrée telle quelle
 * - une case vide qu'on INCRÉMENTE part de zéro
 * - jamais de négatif : la convention d'assistance passe par le bouton
 *   « assistance », pas par le signe (AMENDEMENT 3)
 * - arrondi à 2 décimales pour éviter les 67.50000000000001
 */
export function stepValue(current, delta) {
  const raw = String(current ?? "").trim().replace(",", ".");
  const parsed = raw === "" ? null : Number(raw);
  const base = parsed == null || Number.isNaN(parsed) ? null : parsed;
  if (base == null && delta < 0) return "";
  const next = Math.max(0, Math.round(((base ?? 0) + delta) * 100) / 100);
  return String(next);
}

/** Secondes → « 2:15 » (jamais négatif). */
export function formatCountdown(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const min = Math.floor(total / 60);
  return `${min}:${String(total % 60).padStart(2, "0")}`;
}
