// Agrégation de la liste de courses — module JS pur, utilisé par l'app,
// le serveur MCP ET testé directement par verify-phase6.sh.
// Règles v1 (addendum PRD v2.1) :
//  - somme par (item normalisé, unit) ; qty × portion_factor
//  - aucune conversion d'unités : "g" et "pièce" d'un même item = 2 lignes
//  - regroupement par rayon via mapping statique par mots-clés

const RAYON_KEYWORDS = [
  ["protéines", ["poulet", "dinde", "bœuf", "boeuf", "haché", "hache", "saumon", "thon", "cabillaud", "crevette", "œuf", "oeuf", "jambon", "poisson"]],
  ["frais", ["skyr", "yaourt", "fromage", "cottage", "mozzarella", "lait", "beurre", "crème", "whey"]],
  ["légumes-fruits", ["légume", "legume", "tomate", "concombre", "poivron", "courgette", "carotte", "oignon", "épinard", "epinard", "brocoli", "haricot", "banane", "pomme", "kiwi", "fruit", "myrtille", "salade", "crudité", "crudite", "champignon", "edamame", "citron"]],
  ["féculents", ["riz", "pâtes", "pates", "pain", "avoine", "quinoa", "semoule", "pomme de terre", "pommes de terre", "pdt", "wrap", "cracker", "pistolet", "granola", "purée", "puree"]],
];

/** Rayon d'un item (mapping statique en dur, acceptable v1). */
export function rayonOf(item) {
  const s = item.toLowerCase();
  for (const [rayon, keywords] of RAYON_KEYWORDS) {
    if (keywords.some((k) => s.includes(k))) return rayon;
  }
  return "épicerie";
}

const normalize = (item) => item.trim().toLowerCase();

/**
 * @param {Array<{portion_factor: number|string,
 *   recipe: {ingredients: Array<{item: string, qty: number, unit: string}>}}>} entries
 * @returns {Array<{item: string, qty: number, unit: string, rayon: string}>}
 *   trié par rayon puis item.
 */
export function aggregateShoppingList(entries) {
  const acc = new Map(); // clé "item|unit" → {item, qty, unit}
  for (const entry of entries) {
    const factor = Number(entry.portion_factor) || 1;
    for (const ing of entry.recipe?.ingredients ?? []) {
      const key = `${normalize(ing.item)}|${ing.unit}`;
      const existing = acc.get(key);
      const qty = Number(ing.qty) * factor;
      if (existing) existing.qty += qty;
      else acc.set(key, { item: ing.item.trim(), qty, unit: ing.unit });
    }
  }
  return [...acc.values()]
    .map((row) => ({
      ...row,
      qty: Math.round(row.qty * 100) / 100,
      rayon: rayonOf(row.item),
    }))
    .sort(
      (a, b) => a.rayon.localeCompare(b.rayon) || a.item.localeCompare(b.item)
    );
}

/** Liste en texte brut copiable, groupée par rayon. */
export function shoppingListAsText(items) {
  const byRayon = new Map();
  for (const it of items) {
    byRayon.set(it.rayon, [...(byRayon.get(it.rayon) ?? []), it]);
  }
  return [...byRayon.entries()]
    .map(
      ([rayon, rows]) =>
        `${rayon.toUpperCase()}\n` +
        rows.map((r) => `- ${r.item} : ${r.qty} ${r.unit}`).join("\n")
    )
    .join("\n\n");
}
