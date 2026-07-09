export type PlanEntryForLog = {
  plan_date: string;
  slot: string;
  portion_factor: number | string;
  recipe: {
    id: string;
    kcal: number;
    protein_g: number | string;
    carbs_g: number | string;
    fat_g: number | string;
  };
};

export type MealLogPayload = {
  log_date: string;
  slot: string;
  recipe_id: string;
  portion_factor: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export function mealLogFromPlan(entry: PlanEntryForLog): MealLogPayload;
