"use client";

import { useMemo, useState } from "react";
import type { ExerciseSeries } from "@/lib/trends-server";
import { CHART_H, CHART_W, PAD, fmtDate, polyline, xScale, yScale } from "./chart-utils";
import { formatWeight } from "@/lib/last-sets.mjs";

// LE graphique motivation de la recomp (PRD §4) : par exercice, poids max
// OU volume (Σ séries × reps × poids) par séance. Baselines inclus (point
// de départ). Sélecteur + bascule côté client, données déjà chargées.
export function ProgressionChart({ series }: { series: ExerciseSeries[] }) {
  const withData = useMemo(() => series.filter((s) => s.points.length > 0), [series]);
  const [exerciseId, setExerciseId] = useState(withData[0]?.id ?? "");
  const [mode, setMode] = useState<"max" | "volume">("max");

  const current = withData.find((s) => s.id === exerciseId) ?? withData[0];
  if (!current) {
    return (
      <p className="rounded-lg border border-border bg-surface px-3 py-6 text-center text-sm text-muted">
        Pas encore de séries loggées.
      </p>
    );
  }

  const pts = current.points
    .map((p) => ({ date: p.date, value: mode === "max" ? p.max_weight_kg : p.volume }))
    .filter((p): p is { date: string; value: number } => p.value != null);
  const last = pts[pts.length - 1];
  const first = pts[0];
  const delta = last && first ? Math.round((last.value - first.value) * 10) / 10 : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex gap-1.5">
        <select
          value={current.id}
          onChange={(e) => setExerciseId(e.target.value)}
          aria-label="Exercice"
          className="h-10 min-w-0 flex-1 truncate rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-muted"
        >
          {withData.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-md border border-border" role="radiogroup" aria-label="Métrique">
          {(["max", "volume"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`h-10 px-3 text-sm font-medium first:rounded-l-md last:rounded-r-md ${
                mode === m ? "bg-primary text-on-primary" : "text-muted"
              }`}
            >
              {m === "max" ? "Max" : "Volume"}
            </button>
          ))}
        </div>
      </div>

      {pts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Pas de poids sur cet exercice (poids du corps).</p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-sm tabular-nums">
              <span className="text-lg font-semibold">
                {mode === "max" ? formatWeight(last.value) : `${last.value} kg`}
              </span>
              <span className="text-muted"> · {fmtDate(last.date)}</span>
            </p>
            {delta !== null && pts.length > 1 && (
              <p className={`text-sm tabular-nums ${delta > 0 ? "text-accent" : "text-muted"}`}>
                {delta > 0 ? "+" : ""}
                {delta} kg depuis {fmtDate(first.date)}
              </p>
            )}
          </div>
          <Chart pts={pts} />
        </>
      )}
    </div>
  );
}

function Chart({ pts }: { pts: { date: string; value: number }[] }) {
  const x = xScale(pts.map((p) => p.date));
  const { y, lo, hi } = yScale(pts.map((p) => p.value));
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="mt-2 w-full" role="img" aria-label="Progression de charge par séance">
      <text x={2} y={PAD.top + 4} className="fill-muted" fontSize="9">{Math.round(hi * 10) / 10}</text>
      <text x={2} y={CHART_H - PAD.bottom} className="fill-muted" fontSize="9">{Math.round(lo * 10) / 10}</text>
      {pts.length > 1 && (
        <polyline
          points={polyline(pts.map((p) => ({ x: x(p.date), y: y(p.value) })))}
          fill="none"
          className="stroke-accent"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {pts.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={3} className="fill-accent" />
      ))}
      <text x={PAD.left} y={CHART_H - 4} className="fill-muted" fontSize="9">{fmtDate(pts[0].date)}</text>
      <text x={CHART_W - PAD.right} y={CHART_H - 4} textAnchor="end" className="fill-muted" fontSize="9">
        {fmtDate(pts[pts.length - 1].date)}
      </text>
    </svg>
  );
}
