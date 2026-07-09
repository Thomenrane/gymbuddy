// Types et constantes isomorphes de l'écran Aujourd'hui.
import { shiftDay } from "@/lib/brussels-day.mjs";

export type Slot = "petit_dej" | "dejeuner" | "collation" | "diner" | "extra";

export const SLOT_ORDER: Slot[] = [
  "petit_dej",
  "dejeuner",
  "collation",
  "diner",
  "extra",
];

export const SLOT_LABELS: Record<Slot, string> = {
  petit_dej: "Petit-déj",
  dejeuner: "Déjeuner",
  collation: "Collation",
  diner: "Dîner",
  extra: "Extra",
};

// Slots comptant pour le streak (les 4 repas structurés, extra exclu).
export const MEAL_SLOTS: Slot[] = ["petit_dej", "dejeuner", "collation", "diner"];

export const PORTION_FACTORS = [0.5, 0.75, 1, 1.25, 1.5] as const;

// Lot 2.1 : presets d'estimation pour les logs libres (macros PO).
// "Une estimation vaut mieux qu'un repas non loggé."
export const FREE_LOG_PRESETS = [
  { label: "Repas léger", kcal: 500, protein_g: 25, carbs_g: 50, fat_g: 20 },
  { label: "Repas moyen", kcal: 800, protein_g: 35, carbs_g: 80, fat_g: 35 },
  { label: "Repas copieux", kcal: 1200, protein_g: 45, carbs_g: 120, fat_g: 55 },
  { label: "Snack/dessert", kcal: 300, protein_g: 5, carbs_g: 40, fat_g: 13 },
  { label: "Boissons (2-3 verres)", kcal: 300, protein_g: 0, carbs_g: 25, fat_g: 0 },
] as const;

export type MealLog = {
  id: string;
  log_date: string;
  slot: Slot;
  recipe_id: string | null;
  free_label: string | null;
  portion_factor: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string | null;
  is_estimate: boolean;
  created_at: string;
  recipe: { name: string } | null;
};

export type Targets = {
  id: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export type BodyMetric = {
  id: string;
  metric_date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  notes: string | null;
};

export function dayTotals(logs: MealLog[]) {
  return logs.reduce(
    (acc, l) => ({
      kcal: acc.kcal + l.kcal,
      protein_g: acc.protein_g + Number(l.protein_g),
      carbs_g: acc.carbs_g + Number(l.carbs_g),
      fat_g: acc.fat_g + Number(l.fat_g),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

/** Arrondi macro à 0,1 g près (évite les flottants moches en dénormalisation). */
export function roundMacro(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Cibles de navigation jour, partagées par les chevrons (DayNav) ET le
 * swipe (DaySwipe) — source unique de vérité (lot 10). Pas de futur
 * au-delà d'aujourd'hui : next = null quand on est déjà à `today`.
 */
export function dayNavTargets(date: string, today: string): {
  prev: string;
  next: string | null;
} {
  return {
    prev: shiftDay(date, -1),
    next: date >= today ? null : shiftDay(date, 1),
  };
}

/** Lien vers la fiche recette d'un log, ou null pour un log libre. */
export function recipeHref(log: { recipe_id: string | null }): string | null {
  return log.recipe_id ? `/recettes/${log.recipe_id}` : null;
}
