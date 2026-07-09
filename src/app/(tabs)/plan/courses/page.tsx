import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { brusselsDay, isIsoDate, mondayOf, shiftDay } from "@/lib/brussels-day.mjs";
import { aggregateShoppingList, shoppingListAsText } from "@/lib/shopping-list.mjs";
import { getWeekPlan } from "@/lib/plan-server";
import { ShoppingChecklist } from "@/components/plan/shopping-checklist";

export const dynamic = "force-dynamic";

const RANGE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmtDay = (iso: string) => RANGE_FMT.format(new Date(`${iso}T12:00:00Z`));

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const monday = mondayOf(week && isIsoDate(week) ? week : brusselsDay());
  const entries = await getWeekPlan(monday);
  const items = aggregateShoppingList(entries);
  const text = shoppingListAsText(items);

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-1">
        <Link
          href={`/plan?week=${monday}`}
          aria-label="Retour au plan"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
        >
          <CaretLeft size={20} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Liste de courses</h1>
          <p className="text-xs text-muted">
            {fmtDay(monday)} – {fmtDay(shiftDay(monday, 6))}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-6 text-center text-sm text-muted">
          Rien à acheter — la semaine n&apos;a pas encore de plan.
        </p>
      ) : (
        <ShoppingChecklist items={items} text={text} />
      )}
    </main>
  );
}
