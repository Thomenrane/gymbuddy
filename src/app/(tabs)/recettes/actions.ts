"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addScannedIngredient } from "@/app/(tabs)/today-actions";
import type { OffPer100g } from "@/lib/off-product.mjs";
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

// ---------- Lot 17 : produit scanné ↔ recettes ----------
// Le lien recette → référence nutritionnelle se fait PAR NOM d'ingrédient
// (comme toute la chaîne de recompose). « Associer » = ajouter le produit
// scanné à la référence puis renommer l'ingrédient de la recette vers le nom
// exact de la référence. Jamais de rapprochement automatique flou : le scan
// gagne partout parce que le PO le décide (propagation explicite).

const sameItem = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function renameIn(ingredients: Ingredient[], oldItem: string, newItem: string) {
  return ingredients.map((i) =>
    sameItem(i.item, oldItem) ? { ...i, item: newItem } : i
  );
}

/**
 * Associe un produit scanné à un ingrédient d'une recette : le produit entre
 * dans la référence (upsert nutrition_ref, comme le scan Aujourd'hui), puis
 * l'ingrédient est renommé vers le nom de la référence. Renvoie les AUTRES
 * recettes actives utilisant l'ancien nom, pour propagation explicite.
 */
export async function associateScannedIngredient(input: {
  recipeId: string;
  oldItem: string;
  ean: string;
  name: string;
  brand?: string | null;
  per100g: OffPer100g;
}): Promise<
  | { error: string }
  | { ok: true; item: string; verified: boolean; others: { id: string; name: string }[] }
> {
  const oldItem = input.oldItem?.trim();
  if (!oldItem) return { error: "Ingrédient à remplacer manquant." };

  const added = await addScannedIngredient(input);
  if ("error" in added) return added;

  const supabase = await createClient();
  const { data: recipe, error: rErr } = await supabase
    .from("recipes")
    .select("id, ingredients")
    .eq("id", input.recipeId)
    .single();
  if (rErr) return { error: `Recette introuvable : ${rErr.message}` };

  const ingredients = renameIn(recipe.ingredients as Ingredient[], oldItem, added.item);
  const { error: uErr } = await supabase
    .from("recipes")
    .update({ ingredients })
    .eq("id", input.recipeId);
  if (uErr) return { error: `Renommage impossible : ${uErr.message}` };

  // Le scan gagne partout — mais sur décision explicite : on liste les autres
  // recettes actives qui utilisent encore l'ancien nom.
  const { data: all } = await supabase
    .from("recipes")
    .select("id, name, ingredients")
    .eq("is_active", true)
    .neq("id", input.recipeId);
  const others = (all ?? [])
    .filter((r) =>
      (r.ingredients as Ingredient[]).some((i) => sameItem(i.item, oldItem))
    )
    .map((r) => ({ id: r.id as string, name: r.name as string }));

  revalidatePath(`/recettes/${input.recipeId}`);
  revalidatePath("/recettes/ingredients");
  return { ok: true, item: added.item, verified: added.verified, others };
}

/** Propage le renommage d'ingrédient aux recettes choisies (le scan gagne). */
export async function propagateIngredientRename(input: {
  recipeIds: string[];
  oldItem: string;
  newItem: string;
}): Promise<{ error: string } | { ok: true; renamed: number }> {
  if (!input.recipeIds?.length) return { ok: true, renamed: 0 };
  const supabase = await createClient();
  let renamed = 0;
  for (const id of input.recipeIds) {
    const { data: r, error: e } = await supabase
      .from("recipes")
      .select("id, ingredients")
      .eq("id", id)
      .single();
    if (e) return { error: `Recette ${id} introuvable : ${e.message}` };
    const { error: uErr } = await supabase
      .from("recipes")
      .update({
        ingredients: renameIn(r.ingredients as Ingredient[], input.oldItem, input.newItem),
      })
      .eq("id", id);
    if (uErr) return { error: `Renommage impossible : ${uErr.message}` };
    revalidatePath(`/recettes/${id}`);
    renamed += 1;
  }
  return { ok: true, renamed };
}

/**
 * Aligne les macros affichées d'une recette sur les valeurs RECOMPOSÉES depuis
 * la référence. Action explicite (jamais un effet de bord du scan) ; refusée
 * si un ingrédient n'est pas référencé (recomposer sous-estimerait). Les logs
 * passés restent figés (règle PRD §3).
 */
export async function alignRecipeMacros(
  id: string
): Promise<{ error: string } | { ok: true; kcal: number }> {
  const { tablesFromRows, computeMacros } = await import("@/lib/nutrition-ref.mjs");
  const supabase = await createClient();
  const { data: recipe, error: rErr } = await supabase
    .from("recipes")
    .select("id, ingredients")
    .eq("id", id)
    .single();
  if (rErr) return { error: `Recette introuvable : ${rErr.message}` };

  const { data: rows, error: nErr } = await supabase
    .from("nutrition_ref")
    .select("item, basis, kcal, protein_g, carbs_g, fat_g");
  if (nErr) return { error: `Référence illisible : ${nErr.message}` };

  const { computed, unknown } = computeMacros(
    recipe.ingredients as Ingredient[],
    tablesFromRows(rows ?? [])
  );
  if (unknown.length > 0)
    return {
      error: `Ingrédient(s) non référencé(s) : ${unknown.join(", ")} — scanne-les ou demande à Claude de les ajouter avant d'aligner.`,
    };

  const r1 = (v: number) => Math.round(v * 10) / 10;
  const { error: uErr } = await supabase
    .from("recipes")
    .update({
      kcal: Math.round(computed.kcal),
      protein_g: r1(computed.protein_g),
      carbs_g: r1(computed.carbs_g),
      fat_g: r1(computed.fat_g),
    })
    .eq("id", id);
  if (uErr) return { error: `Sauvegarde impossible : ${uErr.message}` };

  revalidatePath("/recettes");
  revalidatePath(`/recettes/${id}`);
  return { ok: true, kcal: Math.round(computed.kcal) };
}

/**
 * Supprime une entrée de la référence (page Ingrédients). Le seed CIQUAL est
 * protégé : on ne supprime que ce qui a été ajouté (scan, Claude, PO).
 */
export async function deleteIngredientRef(
  id: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { data: row, error: gErr } = await supabase
    .from("nutrition_ref")
    .select("id, source")
    .eq("id", id)
    .single();
  if (gErr) return { error: `Entrée introuvable : ${gErr.message}` };
  if (row.source === "seed")
    return { error: "Le seed CIQUAL ne se supprime pas depuis l'app." };

  const { error } = await supabase.from("nutrition_ref").delete().eq("id", id);
  if (error) return { error: `Suppression impossible : ${error.message}` };
  revalidatePath("/recettes/ingredients");
  return { ok: true };
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
