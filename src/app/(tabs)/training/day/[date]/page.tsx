import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "@phosphor-icons/react/dist/ssr";
import { isIsoDate } from "@/lib/brussels-day.mjs";
import { formatPace, formatWeight, summarizeSets } from "@/lib/last-sets.mjs";
import { getDayWorkouts } from "@/lib/training-server";
import { WORKOUT_TYPE_LABELS, type Workout, type WorkoutSet } from "@/lib/training";

export const dynamic = "force-dynamic";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isIsoDate(date)) notFound();
  const workouts = await getDayWorkouts(date);

  return (
    <main className="space-y-4">
      <Link
        href={`/training?m=${date.slice(0, 7)}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        Calendrier
      </Link>
      <h1 className="text-2xl font-semibold capitalize tracking-tight">
        {dateLabel(date)}
      </h1>

      {workouts.length === 0 ? (
        <p className="py-8 text-center text-muted">Aucune séance ce jour.</p>
      ) : (
        <div className="space-y-2">
          {workouts.map((w) => (
            <WorkoutCard key={w.id} workout={w} />
          ))}
        </div>
      )}

      <Link
        href={`/training/new?date=${date}`}
        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border font-medium text-muted active:bg-surface"
      >
        <Plus size={18} aria-hidden />
        Ajouter une séance
      </Link>
    </main>
  );
}

function WorkoutCard({ workout }: { workout: Workout }) {
  const sets = workout.workout_sets ?? [];
  const byExercise = new Map<string, WorkoutSet[]>();
  for (const s of [...sets].sort(
    (a, b) => a.position - b.position || a.set_number - b.set_number
  )) {
    const name = s.exercise?.name ?? "?";
    byExercise.set(name, [...(byExercise.get(name) ?? []), s]);
  }
  const isBaseline = workout.notes === "baseline seed — poids de départ";

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
