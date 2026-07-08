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
