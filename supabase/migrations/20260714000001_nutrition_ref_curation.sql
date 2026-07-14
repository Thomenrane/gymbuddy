-- Curation routine d'audit MCP (2026-07-14) : ingrédients non référencés
-- rencontrés dans des recettes source=claude (bowls mexicains, omelette garnie),
-- comptés à zéro par la recompose → ajoutés à la référence (valeurs CIQUAL
-- web-vérifiées). Idempotent (upsert), aligné sur le seed statique
-- scripts/lib/nutrition-ref.mjs. Le générateur scripts/gen-nutrition-seed.mjs
-- reflète désormais ces lignes (cohérence vérifiée par verify-nutrition-ref.sh).
--
-- 'fromage' générique = verified=false ('à vérifier') : valeur type emmental/
-- gruyère râpé, à confirmer par le PO (quel fromage exactement).
insert into nutrition_ref (item, basis, kcal, protein_g, carbs_g, fat_g, verified, source) values
  ('patate douce', '100g', 86, 1.5, 20, 0.15, true, 'florian'),
  ('pommes de terre', '100g', 80, 2, 17, 0.1, true, 'florian'),
  ('haricots noirs', '100g', 132, 8.9, 24, 0.5, true, 'florian'),
  ('guacamole', '100g', 155, 1.8, 5, 14, true, 'florian'),
  ('dinde fumée', '100g', 110, 18, 1.5, 3, true, 'florian'),
  ('maïs + poivron', '100g', 65, 2.2, 12, 0.7, true, 'florian'),
  ('poivrons, oignon', '100g', 32, 1.2, 6, 0.2, true, 'florian'),
  ('fromage', '100g', 360, 25, 1, 29, false, 'florian'),
  ('épices tex-mex', 'portion', 5, 0.3, 1, 0.1, true, 'florian')
on conflict (item, basis) do update set
  kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g, verified = excluded.verified, source = excluded.source;
