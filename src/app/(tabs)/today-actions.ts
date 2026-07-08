"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/brussels-day.mjs";
import { SLOT_ORDER, roundMacro, type Slot } from "@/lib/today";

export type ActionResult = { error: string } | { ok: true };

function bad(error: string): ActionResult {
  return { error };
}

function validDateSlot(date: string, slot: string): string | null {
  if (!isIsoDate(date)) return "Date invalide.";
  if (!SLOT_ORDER.includes(slot as Slot)) return "Slot invalide.";
  return null;
}

/**
 * Log d'une recette : macros dénormalisées CALCULÉES À L'INSERTION
 * (recette × portion) puis figées — modifier la recette ensuite ne
 * réécrit jamais ce log (règle PRD §3).
 */
export async function logMealFromRecipe(input: {
  date: string;
  slot: Slot;
  recipeId: string;
  portionFactor: number;
  notes?: string;
}): Promise<ActionResult> {
  const err = validDateSlot(input.date, input.slot);
  if (err) return bad(err);
  const factor = Number(input.portionFactor);
  if (!Number.isFinite(factor) || factor <= 0 || factor > 10)
    return bad("Portion invalide.");

  const supabase = await createClient();
  const { data: recipe, error: rErr } = await supabase
    .from("recipes")
    .select("kcal, protein_g, carbs_g, fat_g")
    .eq("id", input.recipeId)
    .single();
  if (rErr) return bad(`Recette introuvable : ${rErr.message}`);

  const { error } = await supabase.from("meal_logs").insert({
    log_date: input.date,
    slot: input.slot,
    recipe_id: input.recipeId,
    portion_factor: factor,
    kcal: Math.round(recipe.kcal * factor),
    protein_g: roundMacro(Number(recipe.protein_g) * factor),
    carbs_g: roundMacro(Number(recipe.carbs_g) * factor),
    fat_g: roundMacro(Number(recipe.fat_g) * factor),
    notes: input.notes?.trim() || null,
  });
  if (error) return bad(`Log impossible : ${error.message}`);

  revalidatePath("/");
  return { ok: true };
}

export async function logFreeMeal(input: {
  date: string;
  slot: Slot;
  label: string;
  kcal: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  notes?: string;
}): Promise<ActionResult> {
  const err = validDateSlot(input.date, input.slot);
  if (err) return bad(err);
  const label = input.label.trim();
  if (!label) return bad("Le nom du log libre est obligatoire.");
  const kcal = Math.round(Number(input.kcal));
  if (!Number.isFinite(kcal) || kcal < 0) return bad("kcal obligatoires (≥ 0).");

  const supabase = await createClient();
  const { error } = await supabase.from("meal_logs").insert({
    log_date: input.date,
    slot: input.slot,
    free_label: label,
    portion_factor: 1,
    kcal,
    protein_g: roundMacro(Number(input.protein_g) || 0),
    carbs_g: roundMacro(Number(input.carbs_g) || 0),
    fat_g: roundMacro(Number(input.fat_g) || 0),
    notes: input.notes?.trim() || null,
  });
  if (error) return bad(`Log impossible : ${error.message}`);

  revalidatePath("/");
  return { ok: true };
}

/**
 * Édition d'un log : le client envoie l'état final (slot, portion, macros,
 * notes). Le recalcul de portion se fait côté client à partir des macros
 * FIGÉES du log (jamais depuis la recette actuelle) — override manuel libre.
 */
export async function updateMealLog(
  id: string,
  patch: {
    slot: Slot;
    portion_factor: number;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    notes?: string;
  }
): Promise<ActionResult> {
  if (!SLOT_ORDER.includes(patch.slot)) return bad("Slot invalide.");
  const kcal = Math.round(Number(patch.kcal));
  if (!Number.isFinite(kcal) || kcal < 0) return bad("kcal invalides.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_logs")
    .update({
      slot: patch.slot,
      portion_factor: Number(patch.portion_factor) || 1,
      kcal,
      protein_g: roundMacro(Number(patch.protein_g) || 0),
      carbs_g: roundMacro(Number(patch.carbs_g) || 0),
      fat_g: roundMacro(Number(patch.fat_g) || 0),
      notes: patch.notes?.trim() || null,
    })
    .eq("id", id);
  if (error) return bad(`Sauvegarde impossible : ${error.message}`);

  revalidatePath("/");
  return { ok: true };
}

export async function deleteMealLog(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("meal_logs").delete().eq("id", id);
  if (error) return bad(`Suppression impossible : ${error.message}`);
  revalidatePath("/");
  return { ok: true };
}

/** Pesée du jour : upsert par date (2 saisies le même jour = 1 ligne). */
export async function upsertBodyMetric(input: {
  date: string;
  weight_kg?: number | null;
  waist_cm?: number | null;
}): Promise<ActionResult> {
  if (!isIsoDate(input.date)) return bad("Date invalide.");
  const weight = input.weight_kg == null ? null : Number(input.weight_kg);
  const waist = input.waist_cm == null ? null : Number(input.waist_cm);
  if (weight == null && waist == null) return bad("Renseigne au moins le poids.");
  if (weight != null && !(weight > 20 && weight < 400)) return bad("Poids invalide.");
  if (waist != null && !(waist > 30 && waist < 300)) return bad("Tour de taille invalide.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("body_metrics")
    .upsert(
      { metric_date: input.date, weight_kg: weight, waist_cm: waist },
      { onConflict: "metric_date" }
    );
  if (error) return bad(`Pesée impossible : ${error.message}`);

  revalidatePath("/");
  return { ok: true };
}

export async function updateTargets(input: {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}): Promise<ActionResult> {
  const vals = [input.kcal, input.protein_g, input.carbs_g, input.fat_g, input.fiber_g];
  if (vals.some((v) => !Number.isFinite(Number(v)) || Number(v) <= 0))
    return bad("Toutes les cibles doivent être des nombres > 0.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("targets")
    .update({
      kcal: Math.round(input.kcal),
      protein_g: Math.round(input.protein_g),
      carbs_g: Math.round(input.carbs_g),
      fat_g: Math.round(input.fat_g),
      fiber_g: Math.round(input.fiber_g),
    })
    .eq("id", 1);
  if (error) return bad(`Sauvegarde impossible : ${error.message}`);

  revalidatePath("/");
  revalidatePath("/reglages");
  return { ok: true };
}
