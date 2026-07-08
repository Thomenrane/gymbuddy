import { brusselsDay, isIsoDate } from "@/lib/brussels-day.mjs";
import { SLOT_ORDER, dayTotals } from "@/lib/today";
import {
  getBodyMetric,
  getDayLogs,
  getPickerRecipes,
  getStreak,
  getTargets,
} from "@/lib/today-server";
import { DayNav } from "@/components/today/day-nav";
import { MacroSummary } from "@/components/today/macro-summary";
import { SlotSection } from "@/components/today/slot-section";
import { WeightWidget } from "@/components/today/weight-widget";
import { TodayProvider, type PickerItem } from "@/components/today/add-log";

export const dynamic = "force-dynamic";

export default async function AujourdhuiPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;
  const today = brusselsDay();
  const date = rawDate && isIsoDate(rawDate) && rawDate <= today ? rawDate : today;

  const [targets, logs, metric, streak, recipes] = await Promise.all([
    getTargets(),
    getDayLogs(date),
    getBodyMetric(date),
    getStreak(today),
    getPickerRecipes(),
  ]);

  const totals = dayTotals(logs);
  const picker: PickerItem[] = recipes.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    kcal: r.kcal,
    protein_g: Number(r.protein_g),
    prep_min: r.prep_min,
    lastLoggedAt: r.lastLoggedAt,
  }));

  return (
    <main className="space-y-4">
      <DayNav date={date} streak={streak} />
      <MacroSummary totals={totals} targets={targets} />
      <WeightWidget key={date + (metric?.id ?? "")} date={date} metric={metric} />
      <TodayProvider date={date} recipes={picker}>
        <div className="space-y-4">
          {SLOT_ORDER.map((slot) => (
            <SlotSection
              key={slot}
              slot={slot}
              logs={logs.filter((l) => l.slot === slot)}
            />
          ))}
        </div>
      </TodayProvider>
    </main>
  );
}
