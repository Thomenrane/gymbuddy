// Table de référence nutritionnelle (CIQUAL/ANSES, ancres vérifiées web)
// + recompose des macros d'une recette à partir de ses ingrédients, et
// rend un verdict. Sert de garde-fou AVANT d'encoder une recette (rule
// CLAUDE.md « comparer à une DB avant de valider »).
//
// Bases : viandes/poissons = CRU ; féculents (riz, pâtes, quinoa, semoule,
// avoine) = poids SEC ; poids par pièce et densités ml pour le reste.
// Ancres web (CIQUAL) : blanc de poulet cru 121/23, riz complet cru
// 356/7/77/2.2, haché bœuf 5% cru 130/22, flocons d'avoine 372/13.5/58/7.
//
// Étendre : ajouter tout nouvel ingrédient (valeur /100 g web-vérifiée)
// dans la table appropriée AVANT d'encoder une recette qui l'utilise.

// [kcal, protéines_g, glucides_g, lipides_g] pour 100 g.
export const PER_100G = {
  "blanc de poulet": [121, 23, 0, 2.4],
  "blanc de poulet ou dinde": [118, 23, 0, 2],
  "poulet cuit": [165, 31, 0, 3.6],
  "haché de bœuf 5% mg": [130, 22, 0.3, 4.6],
  "pavé de saumon": [200, 20, 0, 13],
  "saumon fumé": [180, 25, 0.5, 9],
  "cabillaud": [78, 18, 0, 0.7],
  "crevettes décortiquées": [99, 21, 0.2, 1.5],
  "thon au naturel égoutté": [116, 26, 0, 1],
  "thon au naturel": [116, 26, 0, 1],
  "thon frais ou saumon": [180, 22, 0, 10],
  "jambon maigre": [110, 20, 1, 3],
  "skyr nature": [63, 11, 4, 0.2],
  "cottage cheese": [98, 11, 3.4, 4.3],
  "fromage blanc maigre": [47, 8, 4, 0.2],
  "yaourt grec 0%": [59, 10, 3.8, 0.2],
  "whey": [380, 80, 8, 6],
  "mozzarella light": [170, 19, 1, 10],
  "fromage frais léger": [130, 8, 4, 9],
  "fromage light": [130, 8, 5, 9], "fromage léger": [130, 8, 5, 9],
  "flocons d'avoine": [372, 13.5, 58, 7], "flocons d'avoine mixés": [372, 13.5, 58, 7],
  "granola sans sucres ajoutés": [430, 11, 55, 17],
  "beurre de cacahuète": [600, 25, 12, 50],
  "pain complet": [247, 9, 43, 1.6],
  "riz brun": [356, 7, 77, 2.2],
  "pâtes complètes": [350, 13.5, 62, 2.5],
  "quinoa": [368, 14, 59, 6],
  "semoule complète": [350, 12, 72, 1.5],
  "pommes de terre vapeur": [85, 2, 18, 0.1],
  "purée maison (pdt + lait, sans beurre)": [90, 2.5, 15, 1.5],
  "patate douce rôtie": [90, 1.6, 20, 0.1],
  "pois chiches cuits": [140, 8, 20, 3],
  "haricots rouges égouttés": [120, 8, 20, 0.5],
  "edamame": [120, 11, 9, 5],
  "maïs": [90, 3, 16, 1],
  "noix non salées": [700, 15, 8, 65], "noix": [700, 15, 8, 65],
  "amandes": [630, 21, 7, 53],
  "huile d'olive": [900, 0, 0, 100], "huile de sésame": [900, 0, 0, 100],
  "huile d'olive + citron": [820, 0, 1, 91],
  "beurre": [750, 0.7, 0.6, 82],
  "avocat": [160, 2, 9, 15],
  "chocolat noir 85%": [600, 10, 30, 50],
  "cacao non sucré": [350, 20, 15, 20],
  "graines de chia": [490, 17, 8, 31],
  "myrtilles": [57, 0.7, 14, 0.3], "fruits rouges": [45, 1, 8, 0.3],
  "fruits rouges surgelés": [45, 1, 8, 0.3], "fruits rouges ou sirop 0%": [40, 0.8, 8, 0.2],
  "tomates cerises": [20, 0.9, 3, 0.2],
  "tomates concassées": [30, 1.3, 5, 0.3], "sauce tomate nature": [35, 1.5, 6, 0.5],
  "concombre": [12, 0.6, 2, 0.1], "roquette": [25, 2.6, 2, 0.7],
  "crudités": [28, 1.5, 4, 0.3],
  "crudités (concombre, poivron, tomates cerises, carottes)": [25, 1.3, 4, 0.2],
  "concombre + carotte râpée": [30, 1, 6, 0.2],
  "légumes surgelés en mélange": [42, 2.5, 6, 0.5],
  "wok de légumes surgelés": [45, 2.5, 6, 0.6],
  "légumes dans la sauce (courgette, poivron, champignons)": [25, 1.5, 3.5, 0.3],
  "légumes (poivron, courgette, oignon)": [28, 1.3, 5, 0.2],
  "légumes (courgette, carotte, tomate)": [28, 1.3, 5, 0.2],
  "légumes (carotte, courgette, épinards)": [30, 1.6, 5, 0.3],
  "poivron + oignon": [32, 1.2, 6, 0.2],
  "brocoli ou haricots verts": [32, 2.6, 4, 0.4],
  "épinards ou haricots": [28, 2.5, 3, 0.4],
  // Ajouts audit plan Claude.ai (valeurs web-vérifiées) :
  "feta": [265, 17.5, 1.5, 21],
  "cheddar": [399, 25, 1.5, 33],
  "olives": [120, 1, 4, 11],
  "graines de sésame": [573, 25, 4.5, 56],
  "nouilles soba": [351, 14, 72, 2], // sèches (convention féculents = poids sec)
  "pain gris ou complet": [247, 9, 43, 1.6],
  "courgette en dés": [17, 1.2, 2.5, 0.3],
  "brocoli, poivron, carotte": [33, 2.4, 5, 0.4],
  "concombre, tomate, oignon rouge": [22, 1, 4, 0.2],
  "salade, tomate": [18, 1, 3, 0.2],
  // Ajouts routine audit MCP 2026-07-14 (recettes source=claude) :
  "patate douce": [86, 1.5, 20, 0.15], // CRUE (web-vérifié CIQUAL 86.3/1.51/~20/0.15)
  "pommes de terre": [80, 2, 17, 0.1], // CRUES (CIQUAL)
  "haricots noirs": [132, 8.9, 24, 0.5], // cuits (aligné haricots rouges)
  "guacamole": [155, 1.8, 5, 14], // préemballé (web-vérifié CIQUAL ~147–191)
  "dinde fumée": [110, 18, 1.5, 3], // blanc de dinde fumé
  "maïs + poivron": [65, 2.2, 12, 0.7], // mélange (maïs dominant + poivron)
  "poivrons, oignon": [32, 1.2, 6, 0.2], // = poivron + oignon
  "fromage": [360, 25, 1, 29], // générique type emmental/gruyère râpé — À CONFIRMER (PO)
};

// [kcal, P, G, L] par PIÈCE (poids moyen incorporé).
export const PER_PIECE = {
  "œuf": [70, 6.3, 0.4, 4.8], "œuf dur": [70, 6.3, 0.4, 4.8],
  "œufs": [70, 6.3, 0.4, 4.8], "œufs durs": [70, 6.3, 0.4, 4.8],
  "banane": [108, 1.4, 24, 0.4], "banane écrasée": [108, 1.4, 24, 0.4],
  "pomme": [78, 0.5, 21, 0.3], "kiwi": [46, 0.8, 11, 0.4],
  "fruit": [95, 1, 22, 0.3],
  "grosses tomates": [27, 1.4, 4.5, 0.3],
  "crackers complets": [36, 0.8, 5.6, 1],   // ~8 g/pièce
  "pistolet complet": [135, 4.5, 25, 1],     // ~50 g
  "wraps complets": [130, 3.5, 21, 3],       // ~43 g tortilla complète
  "barre protéinée": [200, 20, 18, 7],
  "avocat": [240, 3, 13, 22], // 1 avocat moyen, chair ~150 g (web-vérifié)
};

// [kcal, P, G, L] pour 100 ml.
export const PER_100ML = {
  "lait demi-écrémé": [46, 3.3, 4.8, 1.6],
  "lait de coco light": [90, 1, 3, 9],
  "soupe de légumes maison": [35, 1.5, 5, 1],
};

// [kcal, P, G, L] par PORTION (petites sauces / épices, souvent négligeables).
export const PER_PORTION = {
  "épices (paprika, curry, ail, herbes)": [5, 0.3, 1, 0.1],
  "épices chili": [5, 0.3, 1, 0.1], "ras el hanout": [5, 0.3, 1, 0.1],
  "curry + gingembre": [5, 0.3, 1, 0.1], "citron + aneth": [3, 0.1, 0.5, 0],
  "basilic + balsamique": [15, 0.2, 2, 0.5],
  "sauce soja réduite en sel + gingembre": [12, 1.5, 1.5, 0],
  "sauce soja réduite en sel + gingembre + ail": [12, 1.5, 1.5, 0],
  "sauce soja réduite en sel + sésame": [20, 1.5, 1.5, 1.2],
  "moutarde + citron": [15, 1, 1, 1],
  "sauce yaourt-citron": [35, 2.5, 3, 1.5],
  "sauce teriyaki (soja, miel, gingembre)": [40, 2, 7, 0.1], // ~45 g de glaçage
  "jus de citron, sel, poivre": [3, 0.1, 0.5, 0],
  "cannelle": [2, 0.1, 0.5, 0],
  "épices tex-mex": [5, 0.3, 1, 0.1], // routine audit MCP 2026-07-14
};

// Tables par défaut = le SEED de la base nutrition_ref (source de vérité MCP).
// La recompose accepte des tables passées en paramètre (reste testable, et
// permet au serveur MCP de brancher la table DB par-dessus ce seed).
export const DEFAULT_TABLES = {
  g: PER_100G,      // unités g/kg  → /100 g
  ml: PER_100ML,    // unités ml/cl/l → /100 ml
  piece: PER_PIECE, // unité pièce  → par pièce
  portion: PER_PORTION, // unité portion → par portion
};

// basis de la table DB → clé des tables ci-dessus.
export const BASIS_KEY = { "100g": "g", "100ml": "ml", piece: "piece", portion: "portion" };

/**
 * Fusionne des lignes de la table DB `nutrition_ref` par-dessus un seed.
 * Une ligne DB (item, basis, macros) écrase/étend l'entrée du seed → la DB
 * fait autorité, le seed sert de repli quand la table n'existe pas encore.
 * @param {{item:string, basis:string, kcal:number, protein_g:number, carbs_g:number, fat_g:number}[]} rows
 */
export function tablesFromRows(rows = [], base = DEFAULT_TABLES) {
  const t = { g: { ...base.g }, ml: { ...base.ml }, piece: { ...base.piece }, portion: { ...base.portion } };
  for (const r of rows) {
    const key = BASIS_KEY[r.basis];
    if (!key) continue;
    t[key][String(r.item).toLowerCase().trim()] = [
      Number(r.kcal), Number(r.protein_g), Number(r.carbs_g), Number(r.fat_g),
    ];
  }
  return t;
}

// Libellés lisibles du verdict (verdict explicite, jamais noyé — exigence
// Claude.ai) : warn laisse passer mais signale, warn_high = probable erreur.
export const VERDICT_LABEL = {
  ok: "ok — macros cohérentes (écart kcal dans la tolérance)",
  warn: "à revérifier — écart kcal > tolérance (probable sous/sur-estimation)",
  warn_high: "probablement une erreur — écart kcal très élevé",
  review: "ingrédient(s) non référencé(s) — valeur peut-être manquante dans la table",
};

const round = (n) => Math.round(n * 10) / 10;

function refFor(unit, name, tables) {
  if (unit === "g" || unit === "kg") return { ref: tables.g[name], per: 100, scale: unit === "kg" ? 1000 : 1 };
  if (unit === "ml" || unit === "cl" || unit === "l")
    return { ref: tables.ml[name], per: 100, scale: unit === "cl" ? 10 : unit === "l" ? 1000 : 1 };
  if (unit === "pièce" || unit === "piece") return { ref: tables.piece[name], per: 1, scale: 1 };
  if (unit === "portion") return { ref: tables.portion[name], per: 1, scale: 1 };
  return { ref: undefined, per: 1, scale: 1 };
}

/**
 * Recompose les macros à partir des ingrédients, avec le DÉTAIL par ingrédient
 * (contribution de chacun) pour corriger l'ingrédient fautif, pas à l'aveugle.
 * @param {{item:string, qty:number, unit:string}[]} ingredients
 * @param {typeof DEFAULT_TABLES} tables
 * @returns {{ computed:{kcal,protein_g,carbs_g,fat_g}, unknown:string[], contributions:object[] }}
 */
export function computeMacros(ingredients = [], tables = DEFAULT_TABLES) {
  let k = 0, p = 0, c = 0, f = 0;
  const unknown = [];
  const contributions = [];
  for (const i of ingredients) {
    const name = String(i.item ?? "").toLowerCase().trim();
    const { ref, per, scale } = refFor(i.unit, name, tables);
    if (!ref) {
      unknown.push(`${i.item} [${i.unit}]`);
      contributions.push({ item: i.item, qty: Number(i.qty), unit: i.unit, known: false, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      continue;
    }
    const factor = (Number(i.qty) * scale) / per;
    const ck = ref[0] * factor, cp = ref[1] * factor, cc = ref[2] * factor, cf = ref[3] * factor;
    k += ck; p += cp; c += cc; f += cf;
    contributions.push({ item: i.item, qty: Number(i.qty), unit: i.unit, known: true, kcal: Math.round(ck), protein_g: round(cp), carbs_g: round(cc), fat_g: round(cf) });
  }
  return {
    computed: { kcal: Math.round(k), protein_g: round(p), carbs_g: round(c), fat_g: round(f) },
    unknown,
    contributions,
  };
}

/**
 * Verdict de contrôle d'une recette avant encodage (garde-fou GRADUÉ).
 * - "review"    : au moins un ingrédient inconnu → web-vérifier + étendre la table.
 * - "warn_high" : tous connus, écart kcal > highPct → probablement une erreur.
 * - "warn"      : tous connus, écart kcal entre tolerancePct et highPct → à revérifier.
 * - "ok"        : tous connus et dans la tolérance.
 * Aucun verdict ne BLOQUE l'encodage (WARN, pas REJECT — contrôle éditorial) ;
 * le verdict est renvoyé explicitement pour ne jamais être ignoré.
 * @param {{kcal,protein_g,carbs_g,fat_g,ingredients}} recipe
 * @param {{tolerancePct?:number, highPct?:number, tables?:typeof DEFAULT_TABLES}} opts
 */
export function checkRecipe(recipe, { tolerancePct = 10, highPct = 25, tables = DEFAULT_TABLES } = {}) {
  const { computed, unknown, contributions } = computeMacros(recipe.ingredients, tables);
  const claimed = {
    kcal: Number(recipe.kcal),
    protein_g: Number(recipe.protein_g),
    carbs_g: Number(recipe.carbs_g),
    fat_g: Number(recipe.fat_g),
  };
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : 0);
  const deltaPct = {
    kcal: pct(claimed.kcal, computed.kcal),
    protein_g: pct(claimed.protein_g, computed.protein_g),
    carbs_g: pct(claimed.carbs_g, computed.carbs_g),
    fat_g: pct(claimed.fat_g, computed.fat_g),
  };
  let verdict;
  if (unknown.length) verdict = "review";
  else if (Math.abs(deltaPct.kcal) > highPct) verdict = "warn_high";
  else if (Math.abs(deltaPct.kcal) > tolerancePct) verdict = "warn";
  else verdict = "ok";
  return { verdict, label: VERDICT_LABEL[verdict], claimed, computed, deltaPct, unknown, contributions, tolerancePct, highPct };
}
