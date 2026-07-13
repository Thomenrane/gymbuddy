#!/usr/bin/env node
// Test du module pur off-product.mjs (mapping Open Food Facts + macros pesées).
// Prouve : fiche absente → found:false ; fiche complète → macros /100 g exactes ;
// kcal retombe sur les kJ ; champ manquant listé dans `missing` (jamais compté
// à zéro en silence) ; validation EAN ; calcul de portion pesée.
import assert from "node:assert/strict";
import {
  isValidBarcode,
  mapOffProduct,
  macrosForGrams,
} from "../src/lib/off-product.mjs";

// 1. Fiche absente (OFF renvoie status 0) ou réponse invalide.
assert.deepEqual(mapOffProduct({ status: 0 }), { found: false });
assert.deepEqual(mapOffProduct(null), { found: false });
assert.deepEqual(mapOffProduct({ status: 1 }), { found: false });

// 2. Fiche complète (Nutella, valeurs réelles OFF).
const nutella = mapOffProduct({
  status: 1,
  product: {
    product_name: "Nutella",
    brands: "Nutella, Ferrero",
    quantity: "400 g",
    nutriments: {
      "energy-kcal_100g": 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
    },
  },
});
assert.equal(nutella.found, true);
assert.equal(nutella.name, "Nutella");
assert.equal(nutella.brand, "Nutella");
assert.equal(nutella.quantity, "400 g");
assert.deepEqual(nutella.per100g, {
  kcal: 539,
  protein_g: 6.3,
  carbs_g: 57.5,
  fat_g: 30.9,
});
assert.deepEqual(nutella.missing, []);

// 3. kcal absentes de l'étiquette → conversion depuis les kJ (2255 kJ ≈ 539 kcal).
const kj = mapOffProduct({
  status: 1,
  product: {
    product_name: "X",
    nutriments: { energy_100g: 2255, proteins_100g: "6,3" },
  },
});
assert.equal(kj.per100g.kcal, 539);
assert.equal(kj.per100g.protein_g, 6.3); // virgule décimale (string) tolérée
assert.deepEqual(kj.missing, ["carbs_g", "fat_g"]);

// 4. Fiche partielle : le champ absent est LISTÉ, pas silencieusement à zéro.
const partial = mapOffProduct({
  status: 1,
  product: {
    product_name: "Yaourt",
    brands: "",
    nutriments: { "energy-kcal_100g": 60, proteins_100g: 4 },
  },
});
assert.equal(partial.brand, null);
assert.deepEqual(partial.missing, ["carbs_g", "fat_g"]);

// 5. Validation EAN/UPC.
for (const good of ["3017620422003", "12345678", "01234567890123"])
  assert.equal(isValidBarcode(good), true, good);
for (const bad of ["1234567", "123456789012345", "30176abc", "", null, 42])
  assert.equal(isValidBarcode(bad), false, String(bad));

// 6. Portion pesée : 45 g de Nutella.
assert.deepEqual(macrosForGrams(nutella.per100g, 45), {
  kcal: 243, // 539 × 0,45 = 242,55 → arrondi entier
  protein_g: 2.8,
  carbs_g: 25.9,
  fat_g: 13.9,
});
// Champ manquant → 0 dans le calcul (l'UI a déjà signalé `missing`).
assert.equal(macrosForGrams(partial.per100g, 100).fat_g, 0);

console.log("off-product.test : OK (mapping, kJ→kcal, missing, EAN, portion)");
