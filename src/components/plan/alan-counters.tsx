import type { AlanCount } from "@/lib/plan";

// Compteurs Alan — composant partagé (Plan en Phase 6, Tendances en Phase 5).
// Couleur = information : vert règle satisfaite, rouge max dépassé.
export function AlanCounters({ counts }: { counts: AlanCount[] }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {counts.map((c) => {
        const rule =
          c.min !== undefined ? `${c.min}+` : c.max !== undefined ? `max ${c.max}` : "";
        const overMax = c.max !== undefined && c.count > c.max;
        const reachedMin = c.min !== undefined && c.count >= c.min;
        return (
          <span
            key={c.tag}
            className={`shrink-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium ${
              overMax ? "text-destructive" : reachedMin ? "text-accent" : "text-muted"
            }`}
          >
            {c.label} {c.count}
            <span className="opacity-60"> / {rule}</span>
          </span>
        );
      })}
    </div>
  );
}
