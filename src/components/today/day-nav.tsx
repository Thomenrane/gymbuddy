import Link from "next/link";
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Fire,
  GearSix,
} from "@phosphor-icons/react/dist/ssr";
import { brusselsDay, shiftDay } from "@/lib/brussels-day.mjs";
import { dayNavTargets } from "@/lib/today";

const label = (date: string, today: string) => {
  if (date === today) return "Aujourd'hui";
  if (date === shiftDay(today, -1)) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
};

export function DayNav({ date, streak }: { date: string; streak: number }) {
  const today = brusselsDay();
  // Cibles partagées avec le swipe (lot 10) : pas de futur au-delà d'aujourd'hui.
  const { prev, next } = dayNavTargets(date, today);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <Link
          href={`/?date=${prev}`}
          aria-label="Jour précédent"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
        >
          <CaretLeft size={20} />
        </Link>
        <h1 className="min-w-28 text-center text-lg font-semibold capitalize tracking-tight">
          {label(date, today)}
        </h1>
        {next === null ? (
          <span className="flex h-10 w-10 items-center justify-center text-faint" aria-hidden>
            <CaretRight size={20} />
          </span>
        ) : (
          <Link
            href={`/?date=${next}`}
            aria-label="Jour suivant"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
          >
            <CaretRight size={20} />
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2">
        {streak > 0 && (
          <span className="flex items-center gap-1 text-sm text-muted" title="Jours consécutifs avec ≥3 repas loggés">
            <Fire size={16} aria-hidden />
            {streak}
          </span>
        )}
        <Link
          href="/plan"
          aria-label="Plan de la semaine"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
        >
          <CalendarBlank size={20} />
        </Link>
        <Link
          href="/reglages"
          aria-label="Réglages"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
        >
          <GearSix size={20} />
        </Link>
      </div>
    </div>
  );
}
