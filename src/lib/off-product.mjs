// Scan code-barres — mapping d'une fiche produit Open Food Facts (API v2)
// vers le format interne. Module pur, sans dépendance : la route API et le
// client l'utilisent, et node le teste sans build (scripts/off-product.test.mjs).
// Base ouverte (ODbL) : https://world.openfoodfacts.org — fiches crowdsourcées,
// donc parfois incomplètes ; `missing` liste les macros absentes de l'étiquette
// (comptées à 0, jamais en silence : l'UI les signale et marque is_estimate).

const KJ_PER_KCAL = 4.184;

function num(v) {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** EAN/UPC plausible : 8 à 14 chiffres (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function isValidBarcode(code) {
  return typeof code === "string" && /^\d{8,14}$/.test(code.trim());
}

/**
 * `json` = réponse brute de /api/v2/product/{ean}.json.
 * → { found:false } si la fiche n'existe pas, sinon
 * { found:true, name, brand, quantity, per100g, missing }.
 * kcal : la valeur étiquette si présente, sinon conversion depuis les kJ.
 */
export function mapOffProduct(json) {
  const p = json && json.status === 1 ? json.product : null;
  if (!p) return { found: false };
  const n = p.nutriments || {};
  const kj = num(n["energy_100g"]);
  const per100g = {
    kcal: num(n["energy-kcal_100g"]) ?? (kj != null ? Math.round(kj / KJ_PER_KCAL) : null),
    protein_g: num(n["proteins_100g"]),
    carbs_g: num(n["carbohydrates_100g"]),
    fat_g: num(n["fat_100g"]),
  };
  const missing = Object.entries(per100g)
    .filter(([, v]) => v == null)
    .map(([k]) => k);
  const brands = typeof p.brands === "string" ? p.brands : "";
  return {
    found: true,
    name: (typeof p.product_name === "string" && p.product_name.trim()) || null,
    brand: brands.split(",")[0].trim() || null,
    quantity: (typeof p.quantity === "string" && p.quantity.trim()) || null,
    per100g,
    missing,
  };
}

/** Macros pour `grams` g pesés, depuis les valeurs /100 g (absent → 0). */
export function macrosForGrams(per100g, grams) {
  const f = grams / 100;
  const r1 = (v) => Math.round((v || 0) * f * 10) / 10;
  return {
    kcal: Math.round((per100g.kcal || 0) * f),
    protein_g: r1(per100g.protein_g),
    carbs_g: r1(per100g.carbs_g),
    fat_g: r1(per100g.fat_g),
  };
}
