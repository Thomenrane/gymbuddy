import Link from "next/link";
import { CaretLeft, CaretRight, Plus, Notebook } from "@phosphor-icons/react/dist/ssr";
import { brusselsDay } from "@/lib/brussels-day.mjs";
import { getMonthWorkouts } from "@/lib/training-server";
import type { WorkoutType } from "@/lib/training";

export const dynamic = "force-dynamic";

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function monthOf(ym: string | undefined, today: string): [number, number] {
  const m = ym?.match(/^(\d{4})-(\d{2})$/);
  if (m) return [Number(m[1]), Number(m[2])];
  return [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
}
const pad = (n: number) => String(n).padStart(2, "0");

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const today = brusselsDay();
  const [year, month] = monthOf(m, today);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // lundi=0
  const first = `${year}-${pad(month)}-01`;
  const last = `${year}-${pad(month)}-${pad(daysInMonth)}`;
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;

  const workouts = await getMonthWorkouts(first, last);
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
            return (
              <Link
                key={date}
                href={`/training/day/${date}`}
                className={`flex h-12 flex-col items-center justify-center rounded-md text-sm active:bg-surface-raised ${
                  isToday ? "bg-surface-raised font-semibold" : ""
                }`}
              >
                <span>{i + 1}</span>
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

      <Link
        href={`/training/new?date=${today}`}
        aria-label="Nouvelle séance"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary transition-transform active:scale-95"
      >
        <Plus size={28} weight="bold" />
      </Link>
    </main>
  );
}
