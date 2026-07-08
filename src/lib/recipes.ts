// Types et constantes isomorphes (importables côté client).
// Les fetchers serveur sont dans recipes-server.ts.
export type Ingredient = {
  item: string;
  qty: number;
  unit: string;
  note?: string;
};

export type RecipeCategory = "petit_dej" | "dejeuner" | "collation" | "diner";

export type Recipe = {
  id: string;
  code: string | null;
  name: string;
  category: RecipeCategory;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  ingredients: Ingredient[];
  steps: string[] | null;
  prep_min: number | null;
  tags: string[] | null;
  is_active: boolean;
  source: "plan" | "claude" | "florian";
  created_at: string;
};

export const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  petit_dej: "Petit-déj",
  dejeuner: "Déjeuner",
  collation: "Collation",
  diner: "Dîner",
};

export const CATEGORY_ORDER: RecipeCategory[] = [
  "petit_dej",
  "dejeuner",
  "collation",
  "diner",
];

