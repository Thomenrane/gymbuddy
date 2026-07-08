import { SLOT_LABELS, type MealLog, type Slot } from "@/lib/today";
import { MealLogRow } from "./meal-log-row";
import { AddLogButton } from "./add-log";

export function SlotSection({ slot, logs }: { slot: Slot; logs: MealLog[] }) {
  const kcal = logs.reduce((s, l) => s + l.kcal, 0);

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted">{SLOT_LABELS[slot]}</h2>
        {logs.length > 0 && (
          <span className="text-sm text-muted">
            <span className="font-medium text-foreground">{kcal}</span> kcal
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {logs.length > 0 && (
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <MealLogRow key={log.id} log={log} />
            ))}
          </div>
        )}
        <div className={logs.length > 0 ? "border-t border-border p-2" : "p-2"}>
          <AddLogButton slot={slot} />
        </div>
      </div>
    </section>
  );
}
