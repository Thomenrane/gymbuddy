// Lot 8 — les compteurs Alan sont retirés ; seul le suivi du POISSON GRAS
// est conservé (oméga-3, seule règle nutritionnelle réellement suivie).
// Module JS pur : utilisé par l'app, le serveur MCP, ET testé directement
// par scripts/verify-lot8.sh.

export const OILY_FISH_TAG = "poisson-gras";

/**
 * Nombre de repas/entrées dont la recette porte le tag poisson-gras.
 * @param {{tags: string[]|null}[]} recipes
 */
export function oilyFishCount(recipes) {
  return recipes.filter((r) => r.tags?.includes(OILY_FISH_TAG)).length;
}
