/** Incrémente une case de saisie (reps ±1, poids ±2,5). Jamais de négatif. */
export function stepValue(current: string | null | undefined, delta: number): string;
/** Secondes → « 2:15 » (jamais négatif). */
export function formatCountdown(seconds: number): string;
