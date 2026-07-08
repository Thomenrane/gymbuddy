"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus, X } from "@phosphor-icons/react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Ingredient,
  type Recipe,
} from "@/lib/recipes";
import type { RecipeFormState } from "@/app/(tabs)/recettes/actions";

type IngredientRow = { item: string; qty: string; unit: string; note: string };

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-primary";

export function RecipeForm({
  initial,
  action,
  submitLabel,
  cancelHref,
}: {
  initial?: Recipe;
  action: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial?.ingredients.map((i: Ingredient) => ({
      item: i.item,
      qty: String(i.qty),
      unit: i.unit,
      note: i.note ?? "",
    })) ?? [{ item: "", qty: "", unit: "g", note: "" }]
  );
  const [steps, setSteps] = useState<string[]>(
    initial?.steps?.length ? initial.steps : [""]
  );
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));

  function setIngredient(i: number, patch: Partial<IngredientRow>) {
    setIngredients((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row))
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* État sérialisé pour la server action */}
      <input
        type="hidden"
        name="ingredients"
        value={JSON.stringify(ingredients)}
      />
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />
      <input
        type="hidden"
        name="tags"
        value={JSON.stringify(tags.split(","))}
      />
      <input type="hidden" name="category" value={category} />

      <Field label="Nom *">
        <input
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="Poulet riz brun légumes"
          className={inputCls}
        />
      </Field>

      <Field label="Catégorie *">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={category === cat}
              onClick={() => setCategory(cat)}
              className={`rounded-full border px-4 py-2 font-medium transition-colors ${
                category === cat
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border bg-surface"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories (kcal) *">
          <input
            name="kcal"
            inputMode="numeric"
            required
            defaultValue={initial?.kcal}
            className={inputCls}
          />
        </Field>
        <Field label="Préparation (min)">
          <input
            name="prep_min"
            inputMode="numeric"
            defaultValue={initial?.prep_min ?? ""}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Protéines (g) *" labelClass="text-macro-p">
          <input
            name="protein_g"
            inputMode="decimal"
            required
            defaultValue={initial?.protein_g}
            className={inputCls}
          />
        </Field>
        <Field label="Glucides (g) *" labelClass="text-macro-g">
          <input
            name="carbs_g"
            inputMode="decimal"
            required
            defaultValue={initial?.carbs_g}
            className={inputCls}
          />
        </Field>
        <Field label="Lipides (g) *" labelClass="text-macro-l">
          <input
            name="fat_g"
            inputMode="decimal"
            required
            defaultValue={initial?.fat_g}
            className={inputCls}
          />
        </Field>
        <Field label="Fibres (g)">
          <input
            name="fiber_g"
            inputMode="decimal"
            defaultValue={initial?.fiber_g ?? ""}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Ingrédients *">
        <div className="space-y-3">
          {ingredients.map((row, i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-border bg-surface p-3"
            >
              <div className="flex gap-2">
                <input
                  aria-label={`Ingrédient ${i + 1}`}
                  placeholder="Ingrédient"
                  value={row.item}
                  onChange={(e) => setIngredient(i, { item: e.target.value })}
                  className={`${inputCls} bg-surface-raised`}
                />
                {ingredients.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Supprimer l'ingrédient ${i + 1}`}
                    onClick={() =>
                      setIngredients((prev) =>
                        prev.filter((_, idx) => idx !== i)
                      )
                    }
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-muted"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  aria-label="Quantité"
                  placeholder="Qté"
                  inputMode="decimal"
                  value={row.qty}
                  onChange={(e) => setIngredient(i, { qty: e.target.value })}
                  className={`${inputCls} w-24 bg-surface-raised`}
                />
                <input
                  aria-label="Unité"
                  placeholder="g / ml / pièce"
                  value={row.unit}
                  onChange={(e) => setIngredient(i, { unit: e.target.value })}
                  className={`${inputCls} w-32 bg-surface-raised`}
                />
                <input
                  aria-label="Note"
                  placeholder="note (cru…)"
                  value={row.note}
                  onChange={(e) => setIngredient(i, { note: e.target.value })}
                  className={`${inputCls} flex-1 bg-surface-raised`}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setIngredients((prev) => [
                ...prev,
                { item: "", qty: "", unit: "g", note: "" },
              ])
            }
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted"
          >
            <Plus size={16} /> Ajouter un ingrédient
          </button>
        </div>
      </Field>

      <Field label="Étapes">
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                aria-label={`Étape ${i + 1}`}
                placeholder={`Étape ${i + 1}`}
                value={step}
                rows={2}
                onChange={(e) =>
                  setSteps((prev) =>
                    prev.map((s, idx) => (idx === i ? e.target.value : s))
                  )
                }
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none placeholder:text-muted focus:border-primary"
              />
              {steps.length > 1 && (
                <button
                  type="button"
                  aria-label={`Supprimer l'étape ${i + 1}`}
                  onClick={() =>
                    setSteps((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-muted"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev, ""])}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted"
          >
            <Plus size={16} /> Ajouter une étape
          </button>
        </div>
      </Field>

      <Field label="Tags (séparés par des virgules)">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="rapide, meal-prep, poisson"
          className={inputCls}
        />
      </Field>

      {state?.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      <div className="flex gap-2 pb-4">
        <Link
          href={cancelHref}
          className="flex h-13 flex-1 items-center justify-center rounded-xl border border-border bg-surface font-semibold"
        >
          Annuler
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="h-13 flex-[2] rounded-xl bg-primary py-3.5 font-semibold text-on-primary transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Sauvegarde…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  labelClass = "",
}: {
  label: string;
  children: React.ReactNode;
  labelClass?: string;
}) {
  return (
    <div>
      <span className={`mb-1.5 block text-sm font-medium ${labelClass}`}>
        {label}
      </span>
      {children}
    </div>
  );
}
