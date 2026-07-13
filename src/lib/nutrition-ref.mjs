// Ré-export du module pur garde-fou macros. La source unique (tables CIQUAL +
// recompose + verdict gradué) vit dans scripts/lib/nutrition-ref.mjs — lue par
// l'agent/la CLI/la routine ET par le serveur MCP (via cet alias @/lib), pour
// qu'il n'y ait qu'UNE table de référence à faire évoluer.
//
// Côté MCP, la table DB `nutrition_ref` est branchée PAR-DESSUS ce seed via
// tablesFromRows(), en passant le résultat en 2ᵉ argument de checkRecipe.
export {
  PER_100G,
  PER_PIECE,
  PER_100ML,
  PER_PORTION,
  DEFAULT_TABLES,
  BASIS_KEY,
  VERDICT_LABEL,
  tablesFromRows,
  computeMacros,
  checkRecipe,
} from "../../scripts/lib/nutrition-ref.mjs";
