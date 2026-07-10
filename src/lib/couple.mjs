// Mode couple — math pure (Lot 11). Module JS pur partagé par l'app,
// le serveur MCP ET testé directement par scripts/verify-lot11.sh.
//
// Principe : on ne stocke JAMAIS la part de Sarah. Sarah est un profil de
// macros, pas un utilisateur. Un repas « pour deux » enregistre uniquement
// la part du PO (recette × portion × po_share) ; la part de Sarah se dérive
// à l'affichage. Conséquence voulue : les tendances/totaux du PO ne comptent
// jamais Sarah, par construction (les meal_logs ne contiennent que sa part).
//
// Garde-fou (FLAG 2 validé PO) : sur un repas for_two, 0 < po_share < 1 —
// sinon la dérivation de la part de Sarah diviserait par zéro / serait
// incohérente. Imposé ici, côté service, en base (CHECK) et dans le verify.

const roundMacro = (n) => Math.round(n * 10) / 10;

const ZERO = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

/** Macros d'une recette × facteur (kcal entier, macros à 0,1 g près). */
function scaleMacros(recipe, factor) {
  return {
    kcal: Math.round(Number(recipe.kcal) * factor),
    protein_g: roundMacro(Number(recipe.protein_g) * factor),
    carbs_g: roundMacro(Number(recipe.carbs_g) * factor),
    fat_g: roundMacro(Number(recipe.fat_g) * factor),
  };
}

/**
 * Valide et normalise (for_two, po_share). Renvoie la part PO effective.
 *  - solo   : po_share doit être absent ou = 1 → renvoie 1.
 *  - couple : po_share doit être strictement entre 0 et 1 → le renvoie.
 * @param {boolean} forTwo
 * @param {number|string|null|undefined} poShare
 * @returns {number}
 */
export function assertCoupleShare(forTwo, poShare) {
  if (!forTwo) {
    if (poShare != null && Number(poShare) !== 1)
      throw new Error("po_share doit valoir 1.0 pour un repas solo (for_two=false).");
    return 1;
  }
  const s = Number(poShare);
  if (!(s > 0 && s < 1))
    throw new Error(
      "Repas pour deux : po_share (part du PO) doit être strictement entre 0 et 1."
    );
  return s;
}

/**
 * Macros PO figées à l'insertion d'un log = recette × portion_factor × po_share.
 * En solo (for_two=false, po_share=1) → recette × portion_factor, inchangé.
 * @param {{kcal:number, protein_g:number|string, carbs_g:number|string, fat_g:number|string}} recipe
 * @param {number} portionFactor
 * @param {boolean} forTwo
 * @param {number|string|null|undefined} poShare
 */
export function poLogMacros(recipe, portionFactor, forTwo, poShare) {
  const factor = Number(portionFactor) || 1;
  const share = assertCoupleShare(forTwo, poShare);
  return scaleMacros(recipe, factor * share);
}

/**
 * Part de Sarah dérivée d'un log stocké (part PO figée) — JAMAIS stockée.
 * base (plat entier) = part_PO / po_share ; Sarah = base × (1 − po_share).
 * @param {{for_two?:boolean, po_share?:number|string, kcal:number,
 *   protein_g:number|string, carbs_g:number|string, fat_g:number|string}} log
 * @returns {{kcal,protein_g,carbs_g,fat_g}|null} null si le log n'est pas for_two.
 */
export function sarahShareFromLog(log) {
  if (!log?.for_two) return null;
  const share = Number(log.po_share);
  if (!(share > 0 && share < 1)) return null; // robustesse : incohérence ignorée
  const other = (1 - share) / share; // part Sarah / part PO
  return {
    kcal: Math.round(Number(log.kcal) * other),
    protein_g: roundMacro(Number(log.protein_g) * other),
    carbs_g: roundMacro(Number(log.carbs_g) * other),
    fat_g: roundMacro(Number(log.fat_g) * other),
  };
}

/** Somme des parts de Sarah sur une liste de logs (jour). Null si aucun for_two. */
export function sarahDayTotals(logs = []) {
  let any = false;
  const t = { ...ZERO };
  for (const l of logs) {
    const s = sarahShareFromLog(l);
    if (!s) continue;
    any = true;
    t.kcal += s.kcal;
    t.protein_g = roundMacro(t.protein_g + s.protein_g);
    t.carbs_g = roundMacro(t.carbs_g + s.carbs_g);
    t.fat_g = roundMacro(t.fat_g + s.fat_g);
  }
  return any ? t : null;
}

/**
 * Totaux PO et Sarah d'une entrée de plan.
 *  - solo   : PO = recette × portion_factor ; Sarah = null.
 *  - couple : base = recette × total_portion (fait autorité, FLAG 1) ;
 *             PO = base × po_share ; Sarah = base × (1 − po_share).
 *             portion_factor est ignoré en mode couple.
 * @param {{for_two?:boolean, po_share?:number|string, portion_factor?:number|string,
 *   total_portion?:number|string, recipe:object|null}} entry
 * @returns {{po:{kcal,protein_g,carbs_g,fat_g}, sarah:{kcal,protein_g,carbs_g,fat_g}|null}}
 */
export function planEntryMacros(entry) {
  const r = entry?.recipe;
  if (!r) return { po: { ...ZERO }, sarah: null };
  if (!entry.for_two) {
    const f = Number(entry.portion_factor) || 1;
    return { po: scaleMacros(r, f), sarah: null };
  }
  const share = assertCoupleShare(true, entry.po_share);
  const total = Number(entry.total_portion) || 1;
  return {
    po: scaleMacros(r, total * share),
    sarah: scaleMacros(r, total * (1 - share)),
  };
}

/**
 * Facteur de quantité pour la liste de courses (plat ENTIER, PO + Sarah).
 * Couple : total_portion (fait autorité). Solo : portion_factor.
 * @param {{for_two?:boolean, portion_factor?:number|string, total_portion?:number|string}} entry
 */
export function shoppingFactor(entry) {
  return entry?.for_two
    ? Number(entry.total_portion) || 1
    : Number(entry?.portion_factor) || 1;
}

/** Pourcentage de couverture de cibles (Sarah). Null si cible nulle. */
export function pctOfTargets(totals, targets) {
  const pct = (a, b) => (b ? Math.round((Number(a) / Number(b)) * 100) : null);
  return {
    kcal: pct(totals.kcal, targets.kcal),
    protein_g: pct(totals.protein_g, targets.protein_g),
    carbs_g: pct(totals.carbs_g, targets.carbs_g),
    fat_g: pct(totals.fat_g, targets.fat_g),
  };
}
