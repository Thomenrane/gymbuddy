import { Fish } from "@phosphor-icons/react/dist/ssr";

// Lot 8 : les compteurs Alan sont retirés ; seul le poisson gras est
// suivi (oméga-3). Vert dès qu'il y a au moins un repas au poisson gras.
export function OilyFishCounter({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
      <Fish size={18} className={count > 0 ? "text-accent" : "text-muted"} aria-hidden />
      <span className="text-sm">
        <span className={`font-semibold tabular-nums ${count > 0 ? "text-accent" : ""}`}>
          {count}
        </span>
        <span className="text-muted"> repas au poisson gras</span>
      </span>
    </div>
  );
}
