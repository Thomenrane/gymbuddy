// Types du module pur off-product.mjs (scan code-barres Open Food Facts).

export type OffPer100g = {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type OffProduct =
  | { found: false }
  | {
      found: true;
      name: string | null;
      brand: string | null;
      quantity: string | null;
      per100g: OffPer100g;
      missing: string[];
    };

export function isValidBarcode(code: unknown): boolean;
export function mapOffProduct(json: unknown): OffProduct;
export function macrosForGrams(
  per100g: OffPer100g,
  grams: number
): { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
