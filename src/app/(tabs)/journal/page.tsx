import { brusselsDay, isIsoDate } from "@/lib/brussels-day.mjs";
import { SLOT_ORDER, dayTotals } from "@/lib/today";
import {
  getBodyMetric,
  getDayLogs,
  getPickerRecipes,
  getStreak,
  getTargets,
} from "@/lib/today-server";
import { getDayPlan } from "@/lib/plan-server";
import { getPartnerProfile } from "@/lib/partner-server";
import type { PlanSuggestionData } from "@/components/today/plan-suggestion";
import { DayNav } from "@/components/today/day-nav";
import { DaySwipe } from "@/components/today/day-swipe";
import { MacroSummary } from "@/components/today/macro-summary";
import { PartnerSummary } from "@/components/today/partner-summary";
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

  const [targets, logs, metric, streak, recipes, planned, partner] =
    await Promise.all([
      getTargets(),
      getDayLogs(date),
      getBodyMetric(date),
      getStreak(today),
      getPickerRecipes(),
      getDayPlan(date),
      getPartnerProfile(),
    ]);

  const totals = dayTotals(logs);
  const suggestions = new Map<string, PlanSuggestionData>(
    planned
      .filter((e) => e.recipe)
      .map((e) => {
        const factor = Number(e.portion_factor) || 1;
        return [
          e.slot,
          {
            entryId: e.id,
            recipeId: e.recipe_id,
            recipeName: e.recipe!.name,
            portionFactor: factor,
            kcal: Math.round(e.recipe!.kcal * factor),
          },
        ];
      })
  );
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
    <DaySwipe date={date} today={today}>
      <main className="space-y-4">
        <DayNav date={date} streak={streak} />
        <MacroSummary totals={totals} targets={targets} />
        {partner.is_active && <PartnerSummary logs={logs} partner={partner} />}
        <WeightWidget key={date + (metric?.id ?? "")} date={date} metric={metric} />
        <TodayProvider
          date={date}
          recipes={picker}
          couple={partner.is_active ? { name: partner.name } : null}
        >
          <div className="space-y-4">
            {SLOT_ORDER.map((slot) => (
              <SlotSection
                key={slot}
                slot={slot}
                logs={logs.filter((l) => l.slot === slot)}
                suggestion={suggestions.get(slot)}
              />
            ))}
          </div>
        </TodayProvider>
      </main>
    </DaySwipe>
  );
}
