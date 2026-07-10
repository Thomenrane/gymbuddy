import { sarahDayTotals, pctOfTargets } from "@/lib/couple.mjs";
import type { MealLog } from "@/lib/today";
import type { PartnerProfile } from "@/lib/partner-server";

// Encart « part de Sarah » du jour : somme des parts dérivées des repas pour
// deux (jamais stockées). N'apparaît que s'il y a au moins un repas partagé.
export function PartnerSummary({
  logs,
  partner,
}: {
  logs: MealLog[];
  partner: PartnerProfile;
}) {
  const totals = sarahDayTotals(logs);
  if (!totals) return null;
  const pct = pctOfTargets(totals, partner);

  return (
    <section
      aria-label={`Part de ${partner.name} aujourd'hui`}
      className="rounded-lg border border-border bg-surface px-4 py-3"
    >
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted">Part de {partner.name}</h2>
        <span className="text-sm">
          <span className="font-medium">{totals.kcal}</span>{" "}
          <span className="text-muted">
            / {partner.kcal} kcal{pct.kcal != null ? ` · ${pct.kcal}%` : ""}
          </span>
        </span>
      </div>
      <p className="text-xs text-muted">
        <span className="text-macro-p">{Math.round(totals.protein_g)} P</span> ·{" "}
        <span className="text-macro-g">{Math.round(totals.carbs_g)} G</span> ·{" "}
        <span className="text-macro-l">{Math.round(totals.fat_g)} L</span>
        <span className="text-faint"> — calculé, hors de tes tendances</span>
      </p>
    </section>
  );
}
