// Règles Alan (tags des recettes, par semaine) — module JS pur : utilisé
// par le Plan (Phase 6), les Tendances (Phase 5), le serveur MCP, ET testé
// directement par les scripts de vérification.

export const ALAN_RULES = [
  { tag: "poisson", label: "poisson", min: 2 },
  { tag: "pates", label: "pâtes", max: 2 },
  { tag: "hache", label: "haché", max: 2 },
  { tag: "oeufs", label: "œufs", max: 8 },
  { tag: "legumineuses", label: "légumineuses", min: 1 },
];

/**
 * Compte les tags Alan sur une liste de recettes (planifiées ou loggées).
 * @param {{tags: string[]|null}[]} recipes
 */
export function alanCounts(recipes) {
  return ALAN_RULES.map((rule) => {
    const count = recipes.filter((r) => r.tags?.includes(rule.tag)).length;
    const ok =
      (rule.min === undefined || count >= rule.min) &&
      (rule.max === undefined || count <= rule.max);
    return { tag: rule.tag, label: rule.label, count, min: rule.min, max: rule.max, ok };
  });
}
