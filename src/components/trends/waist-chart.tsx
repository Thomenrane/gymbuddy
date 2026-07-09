import type { BodyPoint } from "@/lib/trends-server";
import { CHART_H, CHART_W, PAD, fmtDate, polyline, xScale, yScale } from "./chart-utils";
import { Empty } from "./weight-chart";

export function WaistChart({ metrics }: { metrics: BodyPoint[] }) {
  const pts = metrics.filter((m) => m.waist_cm != null);
  if (pts.length === 0) {
    return <Empty label="Pas encore de tour de taille mesuré." />;
  }

  const x = xScale(pts.map((m) => m.metric_date));
  const { y, lo, hi } = yScale(pts.map((m) => Number(m.waist_cm)));
  const last = pts[pts.length - 1];

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-sm tabular-nums">
        <span className="text-lg font-semibold">{Number(last.waist_cm)}</span>
        <span className="text-muted"> cm · {fmtDate(last.metric_date)}</span>
      </p>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="mt-2 w-full" role="img" aria-label="Tour de taille dans le temps">
        <text x={2} y={PAD.top + 4} className="fill-muted" fontSize="9">{Math.round(hi)}</text>
        <text x={2} y={CHART_H - PAD.bottom} className="fill-muted" fontSize="9">{Math.round(lo)}</text>
        {pts.length > 1 && (
          <polyline
            points={polyline(pts.map((m) => ({ x: x(m.metric_date), y: y(Number(m.waist_cm)) })))}
            fill="none"
            className="stroke-foreground"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        {pts.map((m) => (
          <circle key={m.metric_date} cx={x(m.metric_date)} cy={y(Number(m.waist_cm))} r={2.5} className="fill-foreground" />
        ))}
        <text x={PAD.left} y={CHART_H - 4} className="fill-muted" fontSize="9">{fmtDate(pts[0].metric_date)}</text>
        <text x={CHART_W - PAD.right} y={CHART_H - 4} textAnchor="end" className="fill-muted" fontSize="9">
          {fmtDate(last.metric_date)}
        </text>
      </svg>
    </div>
  );
}
