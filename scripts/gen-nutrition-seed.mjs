// Génère les lignes SQL de seed de la table `nutrition_ref` à partir des tables
// statiques de scripts/lib/nutrition-ref.mjs (source de vérité du seed).
// Toutes les entrées seedées sont verified=true, source='seed'.
//
//   node scripts/gen-nutrition-seed.mjs        # imprime les VALUES (...)
// Utilisé une fois pour composer la migration ; ré-exécutable si la table
// statique change et qu'on veut régénérer le bloc de seed.
import { PER_100G, PER_100ML, PER_PIECE, PER_PORTION } from "./lib/nutrition-ref.mjs";

const BASIS = [
  ["100g", PER_100G],
  ["100ml", PER_100ML],
  ["piece", PER_PIECE],
  ["portion", PER_PORTION],
];

const esc = (s) => String(s).replace(/'/g, "''");
const rows = [];
for (const [basis, table] of BASIS) {
  for (const [item, [kcal, p, c, f]] of Object.entries(table)) {
    rows.push(`  ('${esc(item)}', '${basis}', ${kcal}, ${p}, ${c}, ${f})`);
  }
}
process.stdout.write(rows.join(",\n") + "\n");
