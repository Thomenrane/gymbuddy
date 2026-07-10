"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/brussels-day.mjs";
import { mealLogFromPlan } from "@/lib/plan-log.mjs";
import { assertCoupleShare } from "@/lib/couple.mjs";
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
  // Mode couple : total_portion fait autorité (portion_factor reste 1.0).
  forTwo?: boolean;
  poShare?: number;
  totalPortion?: number;
}): Promise<ActionResult> {
  if (!isIsoDate(input.date)) return bad("Date invalide.");
  if (!SLOT_ORDER.includes(input.slot)) return bad("Slot invalide.");
  const forTwo = Boolean(input.forTwo);
  const factor = forTwo ? 1 : input.portionFactor ?? 1;
  if (!(factor > 0 && factor <= 10)) return bad("Portion invalide.");
  const totalPortion = forTwo ? input.totalPortion ?? 1 : 1;
  if (!(totalPortion > 0 && totalPortion <= 10)) return bad("Portion totale invalide.");
  let poShare: number;
  try {
    poShare = assertCoupleShare(forTwo, forTwo ? input.poShare : 1);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Répartition invalide.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("meal_plan_entries").upsert(
    {
      plan_date: input.date,
      slot: input.slot,
      recipe_id: input.recipeId,
      portion_factor: factor,
      for_two: forTwo,
      po_share: poShare,
      total_portion: totalPortion,
    },
    { onConflict: "plan_date,slot" }
  );
  if (error) return bad(`Planification impossible : ${error.message}`);
  revalidate();
  return { ok: true };
}

/**
 * Ajuste la portion d'une entrée. En couple, c'est total_portion (plat entier)
 * qui fait autorité ; en solo, portion_factor.
 */
export async function updatePlanEntry(
  id: string,
  portion: number,
  forTwo = false
): Promise<ActionResult> {
  if (!(portion > 0 && portion <= 10)) return bad("Portion invalide.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_entries")
    .update(forTwo ? { total_portion: portion } : { portion_factor: portion })
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
