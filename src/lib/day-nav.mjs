// Logique de navigation jour + lien recette — module JS pur partagé par
// les chevrons (DayNav), le swipe (DaySwipe) et testé directement par
// scripts/verify-lot10.sh. Source unique de vérité (lot 10).
import { shiftDay } from "./brussels-day.mjs";

/**
 * Cibles de navigation jour. Pas de futur au-delà d'aujourd'hui :
 * next = null quand `date` est déjà `today` (ou après).
 * @param {string} date @param {string} today
 * @returns {{prev: string, next: string|null}}
 */
export function dayNavTargets(date, today) {
  return {
    prev: shiftDay(date, -1),
    next: date >= today ? null : shiftDay(date, 1),
  };
}

/** Lien vers la fiche recette d'un log, ou null pour un log libre. */
export function recipeHref(log) {
  return log.recipe_id ? `/recettes/${log.recipe_id}` : null;
}
