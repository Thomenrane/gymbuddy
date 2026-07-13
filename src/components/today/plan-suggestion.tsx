"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowSquareOut, CheckCircle } from "@phosphor-icons/react";
import { logFromPlan } from "@/app/(tabs)/plan/plan-actions";
import { recipeHref } from "@/lib/today";

export type PlanSuggestionData = {
  entryId: string;
  recipeId: string;
  recipeName: string;
  portionFactor: number;
  kcal: number;
};

// Suggestion grisée depuis le plan (addendum PRD v2.1) : visible uniquement
// quand le slot n'a AUCUN log ; 1 tap = meal_log aux macros du plan.
export function PlanSuggestion({ suggestion }: { suggestion: PlanSuggestionData }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const href = recipeHref({ recipe_id: suggestion.recipeId });

  return (
    <div className="space-y-1 px-1 pb-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await logFromPlan(suggestion.entryId);
            if ("error" in res) setError(res.error);
          })
        }
        className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-left disabled:opacity-50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm text-muted">
            {suggestion.recipeName}
            {suggestion.portionFactor !== 1 && ` ×${suggestion.portionFactor}`}
            <span className="text-faint"> · prévu au plan</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-sm font-medium text-accent">
            <CheckCircle size={16} aria-hidden />
            Loggé comme prévu
          </span>
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted">
          {suggestion.kcal} kcal
        </span>
      </button>
      {/* Lot 15 (cohérence) : accès à la fiche recette du plat suggéré, sans
          casser le log 1-tap (lien séparé, la fiche = /recettes/[id] existante). */}
      {href && (
        <Link
          href={href}
          className="flex items-center justify-center gap-1 py-0.5 text-xs text-muted active:text-foreground"
        >
          <ArrowSquareOut size={13} aria-hidden />
          Voir la recette
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
