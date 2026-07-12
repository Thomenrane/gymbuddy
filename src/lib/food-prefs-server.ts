import { createClient } from "@/lib/supabase/server";

// Préférences alimentaires (Lot 13) : source de vérité des goûts/aversions,
// par personne. Labels libres, aucun filtrage automatique de recettes.
export type FoodPrefKind = "dislike" | "allergy" | "preference";

export type FoodPreference = {
  id: string;
  person: string;
  kind: FoodPrefKind;
  label: string;
  notes: string | null;
  created_at: string;
};

export async function getAllFoodPreferences(): Promise<FoodPreference[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("food_preferences")
    .select("*")
    .order("person")
    .order("created_at");
  if (error) throw new Error(`getAllFoodPreferences: ${error.message}`);
  return (data ?? []) as FoodPreference[];
}
