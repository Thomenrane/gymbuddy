import type { PeriodAverages } from "@/lib/trends.mjs";
import type { Targets } from "@/lib/today";
import { withinTolerance } from "@/lib/plan";

// Moyennes 7j / 30j vs cibles. Couleur = information : kcal vert si ±5%
// de la cible, protéines vertes si la cible est atteinte.
export function AveragesPanel({
  d7,
  d30,
  targets,
}: {
  d7: PeriodAverages;
  d30: PeriodAverages;
  targets: Targets;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <PeriodCard label="7 derniers jours" data={d7} targets={targets} />
      <PeriodCard label="30 derniers jours" data={d30} targets={targets} />
    </div>
  );
}

function PeriodCard({
  label,
  data,
  targets,
}: {
  label: string;
  data: PeriodAverages;
  targets: Targets;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      {data.days_logged === 0 ? (
        <p className="mt-2 text-sm text-muted">Aucun jour loggé.</p>
      ) : (
        <dl className="mt-2 space-y-2 tabular-nums">
          <div>
            <dt className="sr-only">Calories moyennes par jour</dt>
            <dd
              className={`text-lg font-semibold ${
                withinTolerance(data.kcal_avg ?? 0, targets.kcal) ? "text-accent" : ""
              }`}
            >
              {Math.round(data.kcal_avg ?? 0)}
              <span className="text-xs font-normal text-muted"> / {targets.kcal} kcal</span>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Protéines moyennes par jour</dt>
            <dd
              className={`text-lg font-semibold ${
                (data.protein_avg ?? 0) >= Number(targets.protein_g) ? "text-accent" : ""
              }`}
            >
              {Math.round(data.protein_avg ?? 0)}
              <span className="text-xs font-normal text-muted"> / {Number(targets.protein_g)} g prot.</span>
            </dd>
          </div>
          <p className="text-xs text-muted">{data.days_logged} j loggés</p>
        </dl>
      )}
    </div>
  );
}
