"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORY_ORDER,
  type Ingredient,
  type Recipe,
  type RecipeCategory,
} from "@/lib/recipes";

export type RecipeFormState = { error: string } | null;

// Champs numériques : accepte la virgule (clavier FR) et impose >= 0.
function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseRecipeForm(
  formData: FormData
): { data: Omit<Recipe, "id" | "code" | "is_active" | "source" | "created_at">; error?: never } | { error: string; data?: never } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Le nom est obligatoire." };

  const category = String(formData.get("category") ?? "") as RecipeCategory;
  if (!CATEGORY_ORDER.includes(category))
    return { error: "Choisis une catégorie." };

  const kcal = num(formData, "kcal");
  const protein_g = num(formData, "protein_g");
  const carbs_g = num(formData, "carbs_g");
  const fat_g = num(formData, "fat_g");
  if (kcal === null || protein_g === null || carbs_g === null || fat_g === null)
    return { error: "kcal, P, G et L sont obligatoires (nombres ≥ 0)." };

  let ingredients: Ingredient[];
  let steps: string[];
  let tags: string[];
  try {
    ingredients = JSON.parse(String(formData.get("ingredients") ?? "[]"));
    steps = JSON.parse(String(formData.get("steps") ?? "[]"));
    tags = JSON.parse(String(formData.get("tags") ?? "[]"));
  } catch {
    return { error: "Données du formulaire illisibles, réessaie." };
  }

  ingredients = ingredients
    .map((i) => ({
      item: String(i.item ?? "").trim(),
      qty: Number(String(i.qty).replace(",", ".")),
      unit: String(i.unit ?? "").trim(),
      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
    }))
    .filter((i) => i.item !== "");
  if (ingredients.length === 0)
    return { error: "Ajoute au moins un ingrédient." };
  const bad = ingredients.find(
    (i) => !Number.isFinite(i.qty) || i.qty <= 0 || i.unit === ""
  );
  if (bad)
    return {
      error: `Ingrédient "${bad.item}" : quantité (> 0) et unité obligatoires.`,
    };

  steps = steps.map((s) => s.trim()).filter(Boolean);
  tags = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);

  return {
    data: {
      name,
      category,
      kcal: Math.round(kcal),
      protein_g,
      carbs_g,
      fat_g,
      fiber_g: num(formData, "fiber_g"),
      prep_min: num(formData, "prep_min"),
      ingredients,
      steps,
      tags,
    },
  };
}

export async function createRecipe(
  _prev: RecipeFormState,
  formData: FormData
): Promise<RecipeFormState> {
  const parsed = parseRecipeForm(formData);
  if (parsed.error !== undefined) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ ...parsed.data, source: "florian" })
    .select("id")
    .single();
  if (error) return { error: `Sauvegarde impossible : ${error.message}` };

  revalidatePath("/recettes");
  redirect(`/recettes/${data.id}`);
}

export async function updateRecipe(
  id: string,
  _prev: RecipeFormState,
  formData: FormData
): Promise<RecipeFormState> {
  const parsed = parseRecipeForm(formData);
  if (parsed.error !== undefined) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: `Sauvegarde impossible : ${error.message}` };

  revalidatePath("/recettes");
  revalidatePath(`/recettes/${id}`);
  redirect(`/recettes/${id}`);
}

// "Dupliquer en variante" : copie éditable (code null, source florian),
// atterrit directement sur le formulaire d'édition de la copie.
export async function duplicateRecipe(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: original, error: fetchError } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { id: _id, code: _code, created_at: _c, ...rest } = original;
  const { data, error } = await supabase
    .from("recipes")
    .insert({ ...rest, name: `${original.name} — variante`, source: "florian" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/recettes");
  redirect(`/recettes/${data.id}/edit`);
}

// Suppression douce : la recette disparaît des listes mais reste
// référençable par l'historique des meal_logs (macros figées de toute façon).
export async function archiveRecipe(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/recettes");
  redirect("/recettes");
}
