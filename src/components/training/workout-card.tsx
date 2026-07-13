import Link from "next/link";
import { formatPace, formatWeight, summarizeSets } from "@/lib/last-sets.mjs";
import { WORKOUT_TYPE_LABELS, type Workout, type WorkoutSet } from "@/lib/training";

const BASELINE_NOTE = "baseline seed — poids de départ";

// Carte récapitulative d'une séance (type, durée/distance, exercices résumés).
// Partagée par la vue jour ET l'aperçu inline du calendrier.
export function WorkoutCard({ workout }: { workout: Workout }) {
  const sets = workout.workout_sets ?? [];
  const byExercise = new Map<string, WorkoutSet[]>();
  for (const s of [...sets].sort(
    (a, b) => a.position - b.position || a.set_number - b.set_number
  )) {
    const name = s.exercise?.name ?? "?";
    byExercise.set(name, [...(byExercise.get(name) ?? []), s]);
  }
  const isBaseline = workout.notes === BASELINE_NOTE;

  return (
    <Link
      href={`/training/${workout.id}`}
      className="block rounded-lg border border-border bg-surface p-4 active:bg-surface-raised"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">
          {WORKOUT_TYPE_LABELS[workout.type]}
          {isBaseline && (
            <span className="ml-2 text-xs font-normal text-faint">baseline</span>
          )}
        </span>
        <span className="text-sm text-muted">
          {workout.type === "running" && workout.distance_km != null
            ? `${workout.distance_km} km${formatPace(workout.distance_km, workout.duration_min) ? ` · ${formatPace(workout.distance_km, workout.duration_min)}` : ""}`
            : workout.duration_min != null
              ? `${workout.duration_min} min`
              : ""}
        </span>
      </div>
      {byExercise.size > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-muted">
          {[...byExercise.entries()].map(([name, exSets]) => (
            <li key={name} className="flex justify-between gap-2">
              <span className="truncate">{name}</span>
              <span className="shrink-0">
                {summarizeSets(
                  exSets.map((s) => ({
                    set_number: s.set_number,
                    reps: s.reps,
                    weight_kg: s.weight_kg,
                  }))
                ) ?? formatWeight(null)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {workout.notes && !isBaseline && (
        <p className="mt-2 truncate text-xs text-faint">{workout.notes}</p>
      )}
    </Link>
  );
}
