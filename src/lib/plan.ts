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

/** Delta jour vs cible "vert si ±5%" (addendum Phase 6). */
export function withinTolerance(value: number, target: number, pct = 0.05) {
  return Math.abs(value - target) <= target * pct;
}
