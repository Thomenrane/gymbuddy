// Référence "dernière fois" par exercice (pré-remplissage de l'écran séance).
// Module JS pur : utilisé par l'app ET testé directement par verify-phase3.sh.
// Règle PRD : le dernier poids/reps d'un exo = les sets de son PLUS RÉCENT
// workout (workout_date puis created_at), tous workouts confondus —
// baselines seedées comprises (c'est leur raison d'être).

/**
 * @param {Array<{exercise_id: string, set_number: number, reps: number|null,
 *   weight_kg: number|string|null,
 *   workout: {id: string, workout_date: string, created_at: string}}>} rows
 * @returns {Map<string, {workout_date: string,
 *   sets: Array<{set_number: number, reps: number|null, weight_kg: number|null}>}>}
 */
export function latestSetsByExercise(rows) {
  const byExercise = new Map();
  for (const row of rows) {
    const current = byExercise.get(row.exercise_id);
    const rowKey = `${row.workout.workout_date}|${row.workout.created_at}`;
    if (!current || rowKey > current.key) {
      byExercise.set(row.exercise_id, {
        key: rowKey,
        workoutId: row.workout.id,
        workout_date: row.workout.workout_date,
        sets: [],
      });
    }
  }
  for (const row of rows) {
    const entry = byExercise.get(row.exercise_id);
    if (entry && row.workout.id === entry.workoutId) {
      entry.sets.push({
        set_number: row.set_number,
        reps: row.reps,
        weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
      });
    }
  }
  const result = new Map();
  for (const [exerciseId, entry] of byExercise) {
    entry.sets.sort((a, b) => a.set_number - b.set_number);
    result.set(exerciseId, {
      workout_date: entry.workout_date,
      sets: entry.sets,
    });
  }
  return result;
}

/**
 * Résumé compact "Dernière fois : 3×4 @ 70 kg" (ou détail si sets hétérogènes).
 * Conventions AMENDEMENT 3 : poids négatif = assistance, null = poids du corps.
 */
export function summarizeSets(sets) {
  if (!sets || sets.length === 0) return null;
  const fmt = (s) => `${s.reps ?? "?"}×${formatWeight(s.weight_kg)}`;
  const first = fmt(sets[0]);
  if (sets.every((s) => fmt(s) === first)) {
    return `${sets.length}×${sets[0].reps ?? "?"} @ ${formatWeight(sets[0].weight_kg)}`;
  }
  return sets.map((s) => `${s.reps ?? "?"}@${formatWeight(s.weight_kg)}`).join(" · ");
}

/** Affichage d'un poids selon les conventions du programme. */
export function formatWeight(weightKg) {
  if (weightKg == null) return "PDC";
  const n = Number(weightKg);
  if (n < 0) return `assist. ${Math.abs(n)} kg`;
  return `${n} kg`;
}

/** Pace running en min/km, arrondi à 2 décimales (null si données manquantes). */
export function pace(distanceKm, durationMin) {
  if (!distanceKm || !durationMin || distanceKm <= 0) return null;
  return Math.round((durationMin / distanceKm) * 100) / 100;
}

/** Pace formaté "5:30 /km". */
export function formatPace(distanceKm, durationMin) {
  const p = pace(distanceKm, durationMin);
  if (p == null) return null;
  const min = Math.floor(p);
  const sec = Math.round((p - min) * 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}
