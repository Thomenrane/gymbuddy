// Payload meal_log depuis une entrée de plan ("Loggé comme prévu").
// Module JS pur : utilisé par l'action serveur ET testé directement par
// scripts/verify-phase6.sh — la même formule est exercée des deux côtés.
// Règles PRD : macros = recette × portion du plan, dénormalisées et figées
// (kcal entier, macros à 0,1 g près).

/**
 * @param {{plan_date: string, slot: string, portion_factor: number|string,
 *   recipe: {id: string, kcal: number, protein_g: number|string,
 *     carbs_g: number|string, fat_g: number|string}}} entry
 */
export function mealLogFromPlan(entry) {
  const factor = Number(entry.portion_factor) || 1;
  const r = entry.recipe;
  const macro = (x) => Math.round(Number(x) * factor * 10) / 10;
  return {
    log_date: entry.plan_date,
    slot: entry.slot,
    recipe_id: r.id,
    portion_factor: factor,
    kcal: Math.round(r.kcal * factor),
    protein_g: macro(r.protein_g),
    carbs_g: macro(r.carbs_g),
    fat_g: macro(r.fat_g),
  };
}
