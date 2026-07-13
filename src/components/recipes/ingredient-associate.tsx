"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import {
  ProductInfo,
  ProductScanner,
  type FoundProduct,
} from "@/components/today/barcode-scan";
import {
  associateScannedIngredient,
  propagateIngredientRename,
} from "@/app/(tabs)/recettes/actions";
import type { Ingredient } from "@/lib/recipes";

// Association produit scanné ↔ ingrédient de recette (Lot 17). Le lien se
// fait par NOM : l'ingrédient est renommé vers le nom exact de la référence
// scannée, puis on propose de propager aux autres recettes qui utilisent
// l'ancien nom (« le scan gagne partout », sur décision explicite du PO).

const GRAM_UNITS = ["g", "kg", "ml", "cl", "l"];

export function IngredientAssociate({
  recipeId,
  ingredients,
  known,
}: {
  recipeId: string;
  ingredients: Ingredient[];
  known: boolean[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Ingredient | null>(null);

  return (
    <>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
        {ingredients.map((ing, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-14 text-right font-semibold">
              {ing.qty}
              <span className="ml-0.5 text-xs font-normal text-muted">
                {ing.unit}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              {ing.item}
              {known[i] === false && (
                <span className="ml-1.5 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-xs text-muted">
                  non référencé
                </span>
              )}
              {ing.note && (
                <span className="block text-sm text-muted">{ing.note}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setTarget(ing)}
              aria-label={`Scanner le produit pour ${ing.item}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted active:bg-surface-raised"
            >
              <Barcode size={18} />
            </button>
          </li>
        ))}
      </ul>

      {target && (
        <AssociateSheet
          recipeId={recipeId}
          ingredient={target}
          onClose={() => {
            setTarget(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

type Phase =
  | { step: "scan" }
  | { step: "confirm"; ean: string; product: FoundProduct }
  | { step: "propagate"; item: string; others: { id: string; name: string }[] }
  | { step: "done"; item: string; renamed: number };

function AssociateSheet({
  recipeId,
  ingredient,
  onClose,
}: {
  recipeId: string;
  ingredient: Ingredient;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ step: "scan" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const gramBased = GRAM_UNITS.includes(ingredient.unit.trim().toLowerCase());

  function associate(ean: string, product: FoundProduct) {
    setError("");
    setPending(true);
    associateScannedIngredient({
      recipeId,
      oldItem: ingredient.item,
      ean,
      name: product.name ?? "",
      brand: product.brand,
      per100g: product.per100g,
    })
      .then((res) => {
        if ("error" in res) setError(res.error);
        else if (res.others.length > 0)
          setPhase({ step: "propagate", item: res.item, others: res.others });
        else setPhase({ step: "done", item: res.item, renamed: 0 });
      })
      .finally(() => setPending(false));
  }

  function propagate(item: string, others: { id: string; name: string }[]) {
    setError("");
    setPending(true);
    propagateIngredientRename({
      recipeIds: others.map((o) => o.id),
      oldItem: ingredient.item,
      newItem: item,
    })
      .then((res) => {
        if ("error" in res) setError(res.error);
        else setPhase({ step: "done", item, renamed: res.renamed });
      })
      .finally(() => setPending(false));
  }

  return (
    <Sheet open onClose={onClose} title={`Associer — ${ingredient.item}`}>
      {phase.step === "scan" && (
        <ProductScanner
          onProduct={(ean, product) => setPhase({ step: "confirm", ean, product })}
          onBack={onClose}
          hint={`Scanne le produit que tu utilises vraiment pour « ${ingredient.item} » : la recette prendra ses valeurs étiquette exactes.`}
        />
      )}

      {phase.step === "confirm" && (
        <div className="space-y-3">
          <ProductInfo product={phase.product} />
          {!gramBased && (
            <p className="flex items-start gap-1.5 text-xs text-muted">
              <WarningCircle size={16} className="mt-px shrink-0" aria-hidden />
              Quantité en « {ingredient.unit} » : la référence scannée est en
              /100 g, pense à passer l&apos;ingrédient en grammes (édition de
              la recette) pour une recompose exacte.
            </p>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => associate(phase.ean, phase.product)}
            className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
          >
            Remplacer « {ingredient.item} » par ce produit
          </button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button
            type="button"
            onClick={() => setPhase({ step: "scan" })}
            className="h-12 w-full rounded-md border border-border bg-surface font-medium"
          >
            Scanner un autre
          </button>
        </div>
      )}

      {phase.step === "propagate" && (
        <div className="space-y-3">
          <p className="flex items-start gap-1.5 rounded-md border border-border bg-surface p-3 text-sm">
            <CheckCircle size={18} className="mt-px shrink-0 text-primary" aria-hidden />
            <span>
              Ingrédient remplacé par{" "}
              <span className="font-medium">« {phase.item} »</span> dans cette
              recette.
            </span>
          </p>
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">
              {phase.others.length} autre{phase.others.length > 1 ? "s" : ""}{" "}
              recette{phase.others.length > 1 ? "s" : ""} utilise
              {phase.others.length > 1 ? "nt" : ""} encore «{" "}
              {ingredient.item} » :
            </p>
            <ul className="mt-1.5 list-inside list-disc text-sm text-muted">
              {phase.others.map((o) => (
                <li key={o.id}>{o.name}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending}
              onClick={() => propagate(phase.item, phase.others)}
              className="mt-3 h-11 w-full rounded-md bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
            >
              Basculer aussi ces recettes sur le produit scanné
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-full rounded-md border border-border bg-surface font-medium"
          >
            Non merci, fermer
          </button>
        </div>
      )}

      {phase.step === "done" && (
        <div className="space-y-3">
          <p className="flex items-start gap-1.5 rounded-md border border-border bg-surface p-3 text-sm">
            <CheckCircle size={18} className="mt-px shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-medium">« {phase.item} »</span> est
              maintenant l&apos;ingrédient de{" "}
              {phase.renamed > 0
                ? `cette recette et de ${phase.renamed} autre${phase.renamed > 1 ? "s" : ""}`
                : "cette recette"}
              . Les valeurs étiquette exactes servent à la recompose.
            </span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary"
          >
            Fermer
          </button>
        </div>
      )}
    </Sheet>
  );
}
