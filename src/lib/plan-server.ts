import { createClient } from "@/lib/supabase/server";
import { shiftDay } from "@/lib/brussels-day.mjs";
import type { PlanEntry } from "@/lib/plan";

const RECIPE_COLS =
  "id, code, name, kcal, protein_g, carbs_g, fat_g, tags, ingredients";

/** Entrées planifiées d'une semaine (lundi → dimanche), avec recettes. */
export async function getWeekPlan(monday: string): Promise<PlanEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select(`*, recipe:recipes(${RECIPE_COLS})`)
    .gte("plan_date", monday)
    .lte("plan_date", shiftDay(monday, 6))
    .order("plan_date");
  if (error) throw new Error(`getWeekPlan: ${error.message}`);
  return (data ?? []) as PlanEntry[];
}

/** Entrées planifiées d'un jour (suggestions sur l'écran Aujourd'hui). */
export async function getDayPlan(date: string): Promise<PlanEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select(`*, recipe:recipes(${RECIPE_COLS})`)
    .eq("plan_date", date);
  if (error) throw new Error(`getDayPlan: ${error.message}`);
  return (data ?? []) as PlanEntry[];
}
