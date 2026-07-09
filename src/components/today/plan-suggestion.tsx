"use client";

import { useState, useTransition } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { logFromPlan } from "@/app/(tabs)/plan/plan-actions";

export type PlanSuggestionData = {
  entryId: string;
  recipeName: string;
  portionFactor: number;
  kcal: number;
};

// Suggestion grisée depuis le plan (addendum PRD v2.1) : visible uniquement
// quand le slot n'a AUCUN log ; 1 tap = meal_log aux macros du plan.
export function PlanSuggestion({ suggestion }: { suggestion: PlanSuggestionData }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="px-1 pb-1">
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
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
