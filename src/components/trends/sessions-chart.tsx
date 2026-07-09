import type { WeekSessions } from "@/lib/trends.mjs";
import { fmtDate } from "./chart-utils";

const TYPE_ORDER = ["muscu", "running", "padel", "autre"] as const;
const TYPE_DOT: Record<string, string> = {
  muscu: "bg-foreground",
  running: "bg-[color:var(--muted)]",
  padel: "bg-[color:var(--faint)]",
  autre: "bg-border",
};

// Séances par semaine par type — objectif : 3 muscu (PRD §4).
// Le compteur muscu passe en vert quand l'objectif est atteint.
export function SessionsChart({ weeks }: { weeks: WeekSessions[] }) {
  if (weeks.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-3 py-6 text-center text-sm text-muted">
        Pas encore de séances loggées.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <ul className="divide-y divide-border">
        {weeks.map((w) => {
          const muscu = w.counts.muscu ?? 0;
          return (
            <li key={w.week_start} className="flex items-center gap-3 px-3 py-2.5">
              <span className="w-16 shrink-0 text-xs tabular-nums text-muted">
                {fmtDate(w.week_start)}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1" aria-hidden>
                {TYPE_ORDER.flatMap((t) =>
                  Array.from({ length: w.counts[t] ?? 0 }, (_, i) => (
                    <span key={`${t}${i}`} className={`h-4 w-2 rounded-sm ${TYPE_DOT[t]}`} />
                  ))
                )}
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                <span className={muscu >= 3 ? "font-medium text-accent" : "text-muted"}>
                  {muscu}/3 muscu
                </span>
                {w.total > muscu && <span className="text-muted"> +{w.total - muscu}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border px-3 py-2 text-xs text-muted">
        <span className="mr-2 inline-flex items-center gap-1">
          <span className="inline-block h-3 w-2 rounded-sm bg-foreground" aria-hidden /> muscu
        </span>
        <span className="mr-2 inline-flex items-center gap-1">
          <span className="inline-block h-3 w-2 rounded-sm bg-[color:var(--muted)]" aria-hidden /> running
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-2 rounded-sm bg-[color:var(--faint)]" aria-hidden /> padel
        </span>
      </p>
    </div>
  );
}
