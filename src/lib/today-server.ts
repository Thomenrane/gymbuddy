import { createClient } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/recipes";
import {
  MEAL_SLOTS,
  type BodyMetric,
  type MealLog,
  type Slot,
  type Targets,
} from "@/lib/today";
import { shiftDay } from "@/lib/brussels-day.mjs";

export async function getTargets(): Promise<Targets> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("targets")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`getTargets: ${error.message}`);
  return data as Targets;
}

export async function getDayLogs(date: string): Promise<MealLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_logs")
    .select("*, recipe:recipes(name)")
    .eq("log_date", date)
    .order("created_at");
  if (error) throw new Error(`getDayLogs: ${error.message}`);
  return (data ?? []) as MealLog[];
}

export async function getBodyMetric(date: string): Promise<BodyMetric | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("body_metrics")
    .select("*")
    .eq("metric_date", date)
    .maybeSingle();
  return data as BodyMetric | null;
}

/**
 * Streak : jours consécutifs avec >= 3 slots repas distincts (extra exclu),
 * en remontant depuis `today` (le jour courant compte s'il est déjà complet,
 * sinon le streak court à partir d'hier — pas culpabilisant en journée).
 */
export async function getStreak(today: string): Promise<number> {
  const supabase = await createClient();
  const since = shiftDay(today, -120);
  const { data, error } = await supabase
    .from("meal_logs")
    .select("log_date, slot")
    .gte("log_date", since)
    .in("slot", MEAL_SLOTS);
  if (error) return 0;

  const slotsByDay = new Map<string, Set<Slot>>();
  for (const row of data ?? []) {
    const set = slotsByDay.get(row.log_date) ?? new Set<Slot>();
    set.add(row.slot as Slot);
    slotsByDay.set(row.log_date, set);
  }
  const complete = (d: string) => (slotsByDay.get(d)?.size ?? 0) >= 3;

  let streak = 0;
  let day = complete(today) ? today : shiftDay(today, -1);
  while (complete(day)) {
    streak += 1;
    day = shiftDay(day, -1);
  }
  return streak;
}

export type PickerRecipe = Recipe & { lastLoggedAt: string | null };

/** Recettes actives pour le picker, avec date de dernier log (récents en premier). */
export async function getPickerRecipes(): Promise<PickerRecipe[]> {
  const supabase = await createClient();
  const [{ data: recipes, error }, { data: recents }] = await Promise.all([
    supabase.from("recipes").select("*").eq("is_active", true).order("name"),
    supabase
      .from("meal_logs")
      .select("recipe_id, created_at")
      .not("recipe_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  if (error) throw new Error(`getPickerRecipes: ${error.message}`);

  const lastLogged = new Map<string, string>();
  for (const r of recents ?? []) {
    if (r.recipe_id && !lastLogged.has(r.recipe_id))
      lastLogged.set(r.recipe_id, r.created_at);
  }
  return ((recipes ?? []) as Recipe[]).map((r) => ({
    ...r,
    lastLoggedAt: lastLogged.get(r.id) ?? null,
  }));
}
