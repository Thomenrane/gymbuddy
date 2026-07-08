import type { Targets } from "@/lib/today";

// Header du jour : kcal restantes en gros + protéines dominantes (KPI n°1),
// glucides/lipides en barres fines grises. Couleur = état uniquement.
export function MacroSummary({
  totals,
  targets,
}: {
  totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  targets: Targets;
}) {
  const remaining = targets.kcal - totals.kcal;
  const over = remaining < 0;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <span
            className={`text-4xl font-semibold leading-none ${over ? "text-destructive" : ""}`}
          >
            {Math.abs(remaining)}
          </span>
          <span className="ml-1.5 text-sm text-muted">
            kcal {over ? "au-dessus" : "restantes"}
          </span>
        </div>
        <span className="text-sm text-muted">
          {totals.kcal} / {targets.kcal}
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        <MacroRow
          label="Protéines"
          value={totals.protein_g}
          target={targets.protein_g}
          prominent
        />
        <MacroRow label="Glucides" value={totals.carbs_g} target={targets.carbs_g} />
        <MacroRow label="Lipides" value={totals.fat_g} target={targets.fat_g} />
      </div>
    </section>
  );
}

function MacroRow({
  label,
  value,
  target,
  prominent = false,
}: {
  label: string;
  value: number;
  target: number;
  prominent?: boolean;
}) {
  const pct = Math.min((value / target) * 100, 100);
  const reached = value >= target;
  const display = Math.round(value * 10) / 10;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className={prominent ? "font-medium" : "text-muted"}>{label}</span>
        <span className={prominent && reached ? "font-medium text-accent" : "text-muted"}>
          <span className={prominent ? "font-medium text-foreground" : ""}>
            {display}
          </span>
          {" / "}
          {target} g
        </span>
      </div>
      <div
        className={`overflow-hidden rounded-full bg-border ${prominent ? "h-2.5" : "h-1"}`}
        role="progressbar"
        aria-label={label}
        aria-valuenow={display}
        aria-valuemax={target}
      >
        <div
          className={`h-full rounded-full ${
            prominent ? "bg-accent" : "bg-macro-g"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
