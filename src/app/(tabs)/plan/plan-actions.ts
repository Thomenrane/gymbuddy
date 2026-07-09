"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/brussels-day.mjs";
import { mealLogFromPlan } from "@/lib/plan-log.mjs";
import { SLOT_ORDER, type Slot } from "@/lib/today";

export type ActionResult = { error: string } | { ok: true };

function bad(error: string): ActionResult {
  return { error };
}

function revalidate() {
  revalidatePath("/plan");
  revalidatePath("/");
}

/** Planifie un plat : upsert sur (plan_date, slot) = REMPLACEMENT (FLAG 8). */
export async function planMeal(input: {
  date: string;
  slot: Slot;
  recipeId: string;
  portionFactor?: number;
}): Promise<ActionResult> {
  if (!isIsoDate(input.date)) return bad("Date invalide.");
  if (!SLOT_ORDER.includes(input.slot)) return bad("Slot invalide.");
  const factor = input.portionFactor ?? 1;
  if (!(factor > 0 && factor <= 10)) return bad("Portion invalide.");

  const supabase = await createClient();
  const { error } = await supabase.from("meal_plan_entries").upsert(
    {
      plan_date: input.date,
      slot: input.slot,
      recipe_id: input.recipeId,
      portion_factor: factor,
    },
    { onConflict: "plan_date,slot" }
  );
  if (error) return bad(`Planification impossible : ${error.message}`);
  revalidate();
  return { ok: true };
}

export async function updatePlanEntry(
  id: string,
  portionFactor: number
): Promise<ActionResult> {
  if (!(portionFactor > 0 && portionFactor <= 10)) return bad("Portion invalide.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ portion_factor: portionFactor })
    .eq("id", id);
  if (error) return bad(error.message);
  revalidate();
  return { ok: true };
}

export async function deletePlanEntry(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", id);
  if (error) return bad(error.message);
  revalidate();
  return { ok: true };
}

/**
 * "Loggé comme prévu" : crée le meal_log depuis l'entrée planifiée en 1 tap.
 * Macros = recette × portion du plan, dénormalisées et figées (règles PRD).
 */
export async function logFromPlan(entryId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: entry, error } = await supabase
    .from("meal_plan_entries")
    .select("plan_date, slot, portion_factor, recipe:recipes(id, kcal, protein_g, carbs_g, fat_g)")
    .eq("id", entryId)
    .maybeSingle();
  if (error) return bad(error.message);
  if (!entry?.recipe) return bad("Entrée de plan introuvable.");

  const { error: insErr } = await supabase.from("meal_logs").insert(
    mealLogFromPlan({
      plan_date: entry.plan_date,
      slot: entry.slot,
      portion_factor: entry.portion_factor,
      recipe: entry.recipe as unknown as {
        id: string;
        kcal: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      },
    })
  );
  if (insErr) return bad(`Log impossible : ${insErr.message}`);
  revalidate();
  return { ok: true };
}
