import Link from "next/link";
import {
  CaretLeft,
  CaretRight,
  House,
  ShoppingCart,
} from "@phosphor-icons/react/dist/ssr";
import { brusselsDay, isIsoDate, mondayOf, shiftDay } from "@/lib/brussels-day.mjs";
import { oilyFishCount } from "@/lib/oily-fish.mjs";
import { getWeekPlan } from "@/lib/plan-server";
import { getPickerRecipes, getTargets } from "@/lib/today-server";
import { getPartnerProfile } from "@/lib/partner-server";
import { OilyFishCounter } from "@/components/trends/oily-fish-counter";
import {
  PlanDay,
  PlanProvider,
  type PlanPickerItem,
} from "@/components/plan/plan-week";

export const dynamic = "force-dynamic";

const RANGE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmtDay = (iso: string) => RANGE_FMT.format(new Date(`${iso}T12:00:00Z`));

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const today = brusselsDay();
  const monday = mondayOf(week && isIsoDate(week) ? week : today);
  const sunday = shiftDay(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));

  const [entries, targets, recipes, partner] = await Promise.all([
    getWeekPlan(monday),
    getTargets(),
    getPickerRecipes(),
    getPartnerProfile(),
  ]);

  const picker: PlanPickerItem[] = recipes.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    kcal: r.kcal,
    protein_g: Number(r.protein_g),
  }));
  const oilyFish = oilyFishCount(
    entries.map((e) => ({ tags: e.recipe?.tags ?? null }))
  );

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Link
            href="/"
            aria-label="Retour à Aujourd'hui"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
          >
            <House size={20} />
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Plan</h1>
        </div>
        <Link
          href={`/plan/courses?week=${monday}`}
          className="flex h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium active:bg-surface-raised"
        >
          <ShoppingCart size={16} aria-hidden />
          Courses
        </Link>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-1 py-1">
        <Link
          href={`/plan?week=${shiftDay(monday, -7)}`}
          aria-label="Semaine précédente"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface-raised"
        >
          <CaretLeft size={20} />
        </Link>
        <span className="text-sm font-medium tabular-nums">
          {fmtDay(monday)} – {fmtDay(sunday)}
          {monday === mondayOf(today) && (
            <span className="ml-1.5 text-xs font-normal text-muted">
              cette semaine
            </span>
          )}
        </span>
        <Link
          href={`/plan?week=${shiftDay(monday, 7)}`}
          aria-label="Semaine suivante"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface-raised"
        >
          <CaretRight size={20} />
        </Link>
      </div>

      <OilyFishCounter count={oilyFish} />

      <PlanProvider
        recipes={picker}
        couple={partner.is_active ? { name: partner.name } : null}
      >
        <div className="space-y-3">
          {days.map((date) => (
            <PlanDay
              key={date}
              date={date}
              entries={entries.filter((e) => e.plan_date === date)}
              targets={targets}
              isToday={date === today}
            />
          ))}
        </div>
      </PlanProvider>
    </main>
  );
}
