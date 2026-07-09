import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { formatPace, formatWeight } from "@/lib/last-sets.mjs";
import { getWorkout } from "@/lib/training-server";
import { WORKOUT_TYPE_LABELS, type WorkoutSet } from "@/lib/training";
import { WorkoutActions } from "@/components/training/workout-actions";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workout = await getWorkout(id);
  if (!workout) notFound();

  const byExercise = new Map<string, WorkoutSet[]>();
  for (const s of [...(workout.workout_sets ?? [])].sort(
    (a, b) => a.position - b.position || a.set_number - b.set_number
  )) {
    const name = s.exercise?.name ?? "?";
    byExercise.set(name, [...(byExercise.get(name) ?? []), s]);
  }
  const pace = formatPace(workout.distance_km, workout.duration_min);
  const isBaseline = workout.notes === "baseline seed — poids de départ";

  return (
    <main className="space-y-4">
      <Link
        href={`/training/day/${workout.workout_date}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        {workout.workout_date}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">
        {WORKOUT_TYPE_LABELS[workout.type]}
        {isBaseline && (
          <span className="ml-2 text-sm font-normal text-faint">
            baseline (poids de départ)
          </span>
        )}
      </h1>

      <section className="grid grid-cols-3 gap-2 text-center">
        {workout.type === "running" && workout.distance_km != null && (
          <Stat label="distance" value={`${workout.distance_km} km`} />
        )}
        {workout.duration_min != null && (
          <Stat label="durée" value={`${workout.duration_min} min`} />
        )}
        {pace && <Stat label="pace" value={pace} />}
        {workout.perceived_intensity != null && (
          <Stat label="intensité" value={`${workout.perceived_intensity}/10`} />
        )}
        {workout.run_type && <Stat label="type" value={workout.run_type} />}
      </section>

      {byExercise.size > 0 && (
        <section className="space-y-3">
          {[...byExercise.entries()].map(([name, sets]) => (
            <div key={name} className="rounded-lg border border-border bg-surface p-3">
              <h2 className="font-semibold">{name}</h2>
              <ul className="mt-1.5 space-y-1 text-sm">
                {sets.map((s) => (
                  <li key={s.id} className="flex justify-between text-muted">
                    <span>Série {s.set_number}</span>
                    <span className="text-foreground">
                      {s.reps ?? "?"} reps · {formatWeight(s.weight_kg)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {workout.notes && (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
          {workout.notes}
        </p>
      )}

      <WorkoutActions id={workout.id} type={workout.type} date={workout.workout_date} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-3">
      <div className="font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}
