"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Scales, WarningCircle } from "@phosphor-icons/react";
import { alignRecipeMacros } from "@/app/(tabs)/recettes/actions";
import type { CheckResult } from "@/lib/nutrition-ref.mjs";

// Verdict recomposé de la fiche recette (Lot 17) : macros affichées vs
// recomposées depuis la référence (produits scannés inclus). L'alignement
// est un bouton EXPLICITE — jamais un effet de bord d'un scan — et les logs
// passés restent figés (règle PRD §3).
export function RecipeCheck({
  recipeId,
  check,
}: {
  recipeId: string;
  check: CheckResult;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [aligned, setAligned] = useState(false);

  const ok = check.verdict === "ok";
  const review = check.verdict === "review";

  function align() {
    setError("");
    setPending(true);
    alignRecipeMacros(recipeId)
      .then((res) => {
        if ("error" in res) setError(res.error);
        else {
          setAligned(true);
          router.refresh();
        }
      })
      .finally(() => setPending(false));
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-3">
      <p className="flex items-start gap-1.5 text-sm">
        {ok ? (
          <CheckCircle size={18} className="mt-px shrink-0 text-primary" aria-hidden />
        ) : (
          <WarningCircle size={18} className="mt-px shrink-0 text-muted" aria-hidden />
        )}
        <span>
          <span className="font-medium">
            Recomposé depuis la référence : {check.computed.kcal} kcal
          </span>{" "}
          <span className="text-muted">
            ({check.deltaPct.kcal > 0 ? "+" : ""}
            {check.deltaPct.kcal} % vs affiché · {check.computed.protein_g} P ·{" "}
            {check.computed.carbs_g} G · {check.computed.fat_g} L)
          </span>
        </span>
      </p>

      {review && (
        <p className="mt-1.5 text-sm text-muted">
          Non référencé{check.unknown.length > 1 ? "s" : ""} :{" "}
          {check.unknown.join(", ")} — scanne le produit (icône sur la ligne)
          ou demande à Claude de l&apos;ajouter.
        </p>
      )}

      {!ok && !review && !aligned && (
        <button
          type="button"
          disabled={pending}
          onClick={align}
          className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface-raised text-sm font-medium disabled:opacity-50"
        >
          <Scales size={16} aria-hidden />
          Aligner les macros de la recette ({check.computed.kcal} kcal)
        </button>
      )}
      {aligned && (
        <p className="mt-1.5 text-sm text-muted">
          Macros alignées sur les valeurs recomposées. Les logs passés restent
          inchangés.
        </p>
      )}
      {error && <p role="alert" className="mt-1.5 text-sm text-destructive">{error}</p>}
    </section>
  );
}
