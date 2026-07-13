import Link from "next/link";
import { ArrowSquareOut, CaretLeft, CaretRight, Plus, Notebook } from "@phosphor-icons/react/dist/ssr";
import { brusselsDay, isIsoDate } from "@/lib/brussels-day.mjs";
import { getDayWorkouts, getMonthWorkouts } from "@/lib/training-server";
import { WorkoutCard } from "@/components/training/workout-card";
import type { WorkoutType } from "@/lib/training";

export const dynamic = "force-dynamic";

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

function monthOf(ym: string | undefined, today: string): [number, number] {
  const m = ym?.match(/^(\d{4})-(\d{2})$/);
  if (m) return [Number(m[1]), Number(m[2])];
  return [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
}
const pad = (n: number) => String(n).padStart(2, "0");

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; d?: string }>;
}) {
  const { m, d } = await searchParams;
  const today = brusselsDay();
  const [year, month] = monthOf(m, today);
  // Jour sélectionné dont la séance s'affiche en dessous du calendrier
  // (défaut : aujourd'hui). Évite d'ouvrir la vue jour pour un simple coup d'œil.
  const selectedDate = d && isIsoDate(d) ? d : today;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // lundi=0
  const first = `${year}-${pad(month)}-01`;
  const last = `${year}-${pad(month)}-${pad(daysInMonth)}`;
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;

  const [workouts, dayWorkouts] = await Promise.all([
    getMonthWorkouts(first, last),
    getDayWorkouts(selectedDate),
  ]);
  const typesByDay = new Map<string, Set<WorkoutType>>();
  for (const w of workouts) {
    const set = typesByDay.get(w.workout_date) ?? new Set<WorkoutType>();
    set.add(w.type);
    typesByDay.set(w.workout_date, set);
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Training</h1>
        <Link
          href="/training/templates"
          className="flex h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium"
        >
          <Notebook size={16} aria-hidden />
          Templates
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <Link
          href={`/training?m=${prev}`}
          aria-label="Mois précédent"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
        >
          <CaretLeft size={20} />
        </Link>
        <h2 className="font-medium capitalize">
          {MONTHS[month - 1]} {year}
        </h2>
        <Link
          href={`/training?m=${next}`}
          aria-label="Mois suivant"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
        >
          <CaretRight size={20} />
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-surface p-2">
        <div className="grid grid-cols-7 text-center text-xs text-faint">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDow }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const date = `${year}-${pad(month)}-${pad(i + 1)}`;
            const types = typesByDay.get(date);
            const isToday = date === today;
            const isSelected = date === selectedDate;
            return (
              <Link
                key={date}
                href={`/training?m=${year}-${pad(month)}&d=${date}`}
                scroll={false}
                aria-label={dayLabel(date)}
                aria-current={isSelected ? "date" : undefined}
                className={`flex h-12 flex-col items-center justify-center rounded-md text-sm active:bg-surface-raised ${
                  isSelected ? "bg-surface-raised font-semibold ring-1 ring-primary" : ""
                }`}
              >
                <span className={isToday ? "text-accent" : ""}>{i + 1}</span>
                <span className="flex h-2 items-center gap-0.5">
                  {types?.has("muscu") && (
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground" aria-label="muscu" />
                  )}
                  {types?.has("running") && (
                    <span className="h-1.5 w-1.5 rounded-full border border-foreground" aria-label="running" />
                  )}
                  {(types?.has("padel") || types?.has("autre")) && (
                    <span className="h-0.5 w-2 rounded-full bg-muted" aria-label="padel ou autre" />
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <p className="flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground" /> muscu
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full border border-foreground" /> running
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-2 rounded-full bg-muted" /> padel/autre
        </span>
      </p>

      {/* Aperçu inline de la séance du jour sélectionné : plus besoin d'ouvrir
          la vue jour pour un simple coup d'œil. Le lien mène au détail complet. */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium capitalize text-muted">
            {dayLabel(selectedDate)}
          </h2>
          <Link
            href={`/training/day/${selectedDate}`}
            className="inline-flex items-center gap-1 text-xs text-muted active:text-foreground"
          >
            Ouvrir le jour
            <ArrowSquareOut size={13} aria-hidden />
          </Link>
        </div>

        {dayWorkouts.length === 0 ? (
          <Link
            href={`/training/new?date=${selectedDate}`}
            className="flex h-16 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted active:bg-surface"
          >
            <Plus size={16} aria-hidden />
            Aucune séance — en ajouter une
          </Link>
        ) : (
          dayWorkouts.map((w) => <WorkoutCard key={w.id} workout={w} />)
        )}
      </section>

      <Link
        href={`/training/new?date=${selectedDate}`}
        aria-label="Nouvelle séance"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary transition-transform active:scale-95"
      >
        <Plus size={28} weight="bold" />
      </Link>
    </main>
  );
}
