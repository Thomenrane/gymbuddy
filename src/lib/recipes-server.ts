import { createClient } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/recipes";

export async function getActiveRecipes(): Promise<Recipe[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("code", { nullsFirst: false })
    .order("name");
  if (error) throw new Error(`getActiveRecipes: ${error.message}`);
  return (data ?? []) as Recipe[];
}

// Référence nutritionnelle (Lot 17) : lignes brutes pour la page Ingrédients
// et la recompose des fiches recette (tablesFromRows côté appelant).
export type NutritionRefRow = {
  id: string;
  item: string;
  basis: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  verified: boolean;
  source: string;
  ean: string | null;
  created_at: string;
};

export async function getNutritionRefRows(): Promise<NutritionRefRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nutrition_ref")
    .select("id, item, basis, kcal, protein_g, carbs_g, fat_g, verified, source, ean, created_at")
    .order("item");
  if (error) throw new Error(`getNutritionRefRows: ${error.message}`);
  return (data ?? []) as NutritionRefRow[];
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null; // id malformé (pas un uuid) inclus
  return data as Recipe | null;
}
