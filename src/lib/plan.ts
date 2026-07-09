// Types et constantes isomorphes du planificateur (Phase 6).
import type { Slot } from "@/lib/today";
import type { Ingredient } from "@/lib/recipes";

export type PlanRecipe = {
  id: string;
  code: string | null;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  tags: string[] | null;
  ingredients: Ingredient[];
};

export type PlanEntry = {
  id: string;
  plan_date: string;
  slot: Slot;
  recipe_id: string;
  portion_factor: number;
  notes: string | null;
  created_at: string;
  recipe: PlanRecipe | null;
};

// Règles Alan (partagées avec Tendances en Phase 5) — par semaine.
export const ALAN_RULES = [
  { tag: "poisson", label: "poisson", min: 2 },
  { tag: "pates", label: "pâtes", max: 2 },
  { tag: "hache", label: "haché", max: 2 },
  { tag: "oeufs", label: "œufs", max: 8 },
  { tag: "legumineuses", label: "légumineuses", min: 1 },
] as const;

export type AlanCount = {
  tag: string;
  label: string;
  count: number;
  min?: number;
  max?: number;
  ok: boolean;
};

/** Compte les tags Alan sur une liste de recettes (planifiées ou loggées). */
export function alanCounts(
  recipes: { tags: string[] | null }[]
): AlanCount[] {
  return ALAN_RULES.map((rule) => {
    const count = recipes.filter((r) => r.tags?.includes(rule.tag)).length;
    const min = "min" in rule ? rule.min : undefined;
    const max = "max" in rule ? rule.max : undefined;
    const ok =
      (min === undefined || count >= min) && (max === undefined || count <= max);
    return { tag: rule.tag, label: rule.label, count, min, max, ok };
  });
}

/** Delta jour vs cible "vert si ±5%" (addendum Phase 6). */
export function withinTolerance(value: number, target: number, pct = 0.05) {
  return Math.abs(value - target) <= target * pct;
}
