import type { BodyPoint } from "@/lib/trends-server";
import type { WeeklyWeight } from "@/lib/trends.mjs";
import {
  CHART_H,
  CHART_W,
  PAD,
  fmtDate,
  polyline,
  xScale,
  yScale,
} from "./chart-utils";

// PRD §4 : la MOYENNE HEBDO est la courbe principale (le protocole juge
// dessus), les points quotidiens sont secondaires.
export function WeightChart({
  metrics,
  weekly,
}: {
  metrics: BodyPoint[];
  weekly: WeeklyWeight[];
}) {
  const raw = metrics.filter((m) => m.weight_kg != null);
  if (raw.length === 0) {
    return <Empty label="Pas encore de pesées — loggue ton poids sur Aujourd'hui." />;
  }

  const dates = [...raw.map((m) => m.metric_date), ...weekly.map((w) => w.week_start)];
  const x = xScale(dates);
  const values = [...raw.map((m) => Number(m.weight_kg)), ...weekly.map((w) => w.avg_weight_kg)];
  const { y, lo, hi } = yScale(values);

  const last = weekly[weekly.length - 1];
  const prev = weekly[weekly.length - 2];
  const delta = last && prev ? Math.round((last.avg_weight_kg - prev.avg_weight_kg) * 100) / 100 : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm tabular-nums">
          <span className="text-lg font-semibold">{last?.avg_weight_kg ?? "—"}</span>
          <span className="text-muted"> kg · moy. semaine</span>
        </p>
        {delta !== null && (
          <p className="text-sm tabular-nums text-muted">
            {delta > 0 ? "+" : ""}
            {delta} kg vs sem. préc.
          </p>
        )}
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="mt-2 w-full" role="img" aria-label="Poids : moyenne hebdomadaire et pesées quotidiennes">
        <text x={2} y={PAD.top + 4} className="fill-muted" fontSize="9">{Math.round(hi * 10) / 10}</text>
        <text x={2} y={CHART_H - PAD.bottom} className="fill-muted" fontSize="9">{Math.round(lo * 10) / 10}</text>
        {/* points quotidiens (secondaires) */}
        {raw.map((m) => (
          <circle
            key={m.metric_date}
            cx={x(m.metric_date)}
            cy={y(Number(m.weight_kg))}
            r={2}
            className="fill-faint"
          />
        ))}
        {/* moyenne hebdo (principale) */}
        {weekly.length > 1 && (
          <polyline
            points={polyline(weekly.map((w) => ({ x: x(w.week_start), y: y(w.avg_weight_kg) })))}
            fill="none"
            className="stroke-foreground"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        {weekly.map((w) => (
          <circle key={w.week_start} cx={x(w.week_start)} cy={y(w.avg_weight_kg)} r={3} className="fill-foreground" />
        ))}
        <text x={PAD.left} y={CHART_H - 4} className="fill-muted" fontSize="9">{fmtDate(raw[0].metric_date)}</text>
        <text x={CHART_W - PAD.right} y={CHART_H - 4} textAnchor="end" className="fill-muted" fontSize="9">
          {fmtDate(raw[raw.length - 1].metric_date)}
        </text>
      </svg>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-border bg-surface px-3 py-6 text-center text-sm text-muted">
      {label}
    </p>
  );
}
