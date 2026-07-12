import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "@phosphor-icons/react/dist/ssr";
import { isIsoDate } from "@/lib/brussels-day.mjs";
import { getDayWorkouts } from "@/lib/training-server";
import { WorkoutCard } from "@/components/training/workout-card";

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
