-- Référence nutritionnelle en base (garde-fou macros MCP).
--
-- La table CIQUAL vivait UNIQUEMENT côté agent (scripts/lib/nutrition-ref.mjs) :
-- Claude.ai, via le connecteur MCP, ne pouvait donc PAS vérifier ses propres
-- estimations avant d'encoder une recette → 5 recettes du plan étaient hors
-- tolérance (gras sous-estimé, protéines sous-étiquetées). On matérialise la
-- table en base pour l'exposer au MCP (check_recipe_macros / add_ingredient_ref
-- / list_ingredient_refs) et brancher un backstop de recompose.
--
-- Seed = copie exacte de la table statique (verified=true, source='seed'),
-- généré par scripts/gen-nutrition-seed.mjs. La recompose fusionne la DB
-- PAR-DESSUS ce seed (tablesFromRows) : la DB fait autorité, le seed reste le
-- repli si la table est absente. Un ingrédient ajouté par Claude arrive
-- verified=false ('à vérifier') → l'agent web-vérifie puis bascule verified=true.
--
-- Conventions (identiques au module) : viandes/poissons crus ; féculents secs ;
-- basis ∈ 100g | 100ml | piece | portion ; macros = [kcal, P, G, L] par unité.
create table nutrition_ref (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  basis text not null check (basis in ('100g','100ml','piece','portion')),
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  verified boolean not null default true,
  source text not null default 'seed' check (source in ('seed','claude','florian')),
  created_at timestamptz not null default now(),
  -- une seule valeur par (aliment, base) : add_ingredient_ref refuse un doublon.
  unique (item, basis)
);
-- Consultation fréquente des « à vérifier » (curation agent) → index partiel.
create index nutrition_ref_unverified_idx on nutrition_ref (created_at) where not verified;

alter table nutrition_ref enable row level security;
create policy owner_all on nutrition_ref
  for all to authenticated using (is_owner()) with check (is_owner());

-- Seed initial (table statique CIQUAL, web-vérifiée) — verified=true, source='seed'.
insert into nutrition_ref (item, basis, kcal, protein_g, carbs_g, fat_g) values
  ('blanc de poulet', '100g', 121, 23, 0, 2.4),
  ('blanc de poulet ou dinde', '100g', 118, 23, 0, 2),
  ('poulet cuit', '100g', 165, 31, 0, 3.6),
  ('haché de bœuf 5% mg', '100g', 130, 22, 0.3, 4.6),
  ('pavé de saumon', '100g', 200, 20, 0, 13),
  ('saumon fumé', '100g', 180, 25, 0.5, 9),
  ('cabillaud', '100g', 78, 18, 0, 0.7),
  ('crevettes décortiquées', '100g', 99, 21, 0.2, 1.5),
  ('thon au naturel égoutté', '100g', 116, 26, 0, 1),
  ('thon au naturel', '100g', 116, 26, 0, 1),
  ('thon frais ou saumon', '100g', 180, 22, 0, 10),
  ('jambon maigre', '100g', 110, 20, 1, 3),
  ('skyr nature', '100g', 63, 11, 4, 0.2),
  ('cottage cheese', '100g', 98, 11, 3.4, 4.3),
  ('fromage blanc maigre', '100g', 47, 8, 4, 0.2),
  ('yaourt grec 0%', '100g', 59, 10, 3.8, 0.2),
  ('whey', '100g', 380, 80, 8, 6),
  ('mozzarella light', '100g', 170, 19, 1, 10),
  ('fromage frais léger', '100g', 130, 8, 4, 9),
  ('fromage light', '100g', 130, 8, 5, 9),
  ('fromage léger', '100g', 130, 8, 5, 9),
  ('flocons d''avoine', '100g', 372, 13.5, 58, 7),
  ('flocons d''avoine mixés', '100g', 372, 13.5, 58, 7),
  ('granola sans sucres ajoutés', '100g', 430, 11, 55, 17),
  ('beurre de cacahuète', '100g', 600, 25, 12, 50),
  ('pain complet', '100g', 247, 9, 43, 1.6),
  ('riz brun', '100g', 356, 7, 77, 2.2),
  ('pâtes complètes', '100g', 350, 13.5, 62, 2.5),
  ('quinoa', '100g', 368, 14, 59, 6),
  ('semoule complète', '100g', 350, 12, 72, 1.5),
  ('pommes de terre vapeur', '100g', 85, 2, 18, 0.1),
  ('purée maison (pdt + lait, sans beurre)', '100g', 90, 2.5, 15, 1.5),
  ('patate douce rôtie', '100g', 90, 1.6, 20, 0.1),
  ('pois chiches cuits', '100g', 140, 8, 20, 3),
  ('haricots rouges égouttés', '100g', 120, 8, 20, 0.5),
  ('edamame', '100g', 120, 11, 9, 5),
  ('maïs', '100g', 90, 3, 16, 1),
  ('noix non salées', '100g', 700, 15, 8, 65),
  ('noix', '100g', 700, 15, 8, 65),
  ('amandes', '100g', 630, 21, 7, 53),
  ('huile d''olive', '100g', 900, 0, 0, 100),
  ('huile de sésame', '100g', 900, 0, 0, 100),
  ('huile d''olive + citron', '100g', 820, 0, 1, 91),
  ('beurre', '100g', 750, 0.7, 0.6, 82),
  ('avocat', '100g', 160, 2, 9, 15),
  ('chocolat noir 85%', '100g', 600, 10, 30, 50),
  ('cacao non sucré', '100g', 350, 20, 15, 20),
  ('graines de chia', '100g', 490, 17, 8, 31),
  ('myrtilles', '100g', 57, 0.7, 14, 0.3),
  ('fruits rouges', '100g', 45, 1, 8, 0.3),
  ('fruits rouges surgelés', '100g', 45, 1, 8, 0.3),
  ('fruits rouges ou sirop 0%', '100g', 40, 0.8, 8, 0.2),
  ('tomates cerises', '100g', 20, 0.9, 3, 0.2),
  ('tomates concassées', '100g', 30, 1.3, 5, 0.3),
  ('sauce tomate nature', '100g', 35, 1.5, 6, 0.5),
  ('concombre', '100g', 12, 0.6, 2, 0.1),
  ('roquette', '100g', 25, 2.6, 2, 0.7),
  ('crudités', '100g', 28, 1.5, 4, 0.3),
  ('crudités (concombre, poivron, tomates cerises, carottes)', '100g', 25, 1.3, 4, 0.2),
  ('concombre + carotte râpée', '100g', 30, 1, 6, 0.2),
  ('légumes surgelés en mélange', '100g', 42, 2.5, 6, 0.5),
  ('wok de légumes surgelés', '100g', 45, 2.5, 6, 0.6),
  ('légumes dans la sauce (courgette, poivron, champignons)', '100g', 25, 1.5, 3.5, 0.3),
  ('légumes (poivron, courgette, oignon)', '100g', 28, 1.3, 5, 0.2),
  ('légumes (courgette, carotte, tomate)', '100g', 28, 1.3, 5, 0.2),
  ('légumes (carotte, courgette, épinards)', '100g', 30, 1.6, 5, 0.3),
  ('poivron + oignon', '100g', 32, 1.2, 6, 0.2),
  ('brocoli ou haricots verts', '100g', 32, 2.6, 4, 0.4),
  ('épinards ou haricots', '100g', 28, 2.5, 3, 0.4),
  ('feta', '100g', 265, 17.5, 1.5, 21),
  ('cheddar', '100g', 399, 25, 1.5, 33),
  ('olives', '100g', 120, 1, 4, 11),
  ('graines de sésame', '100g', 573, 25, 4.5, 56),
  ('nouilles soba', '100g', 351, 14, 72, 2),
  ('pain gris ou complet', '100g', 247, 9, 43, 1.6),
  ('courgette en dés', '100g', 17, 1.2, 2.5, 0.3),
  ('brocoli, poivron, carotte', '100g', 33, 2.4, 5, 0.4),
  ('concombre, tomate, oignon rouge', '100g', 22, 1, 4, 0.2),
  ('salade, tomate', '100g', 18, 1, 3, 0.2),
  ('lait demi-écrémé', '100ml', 46, 3.3, 4.8, 1.6),
  ('lait de coco light', '100ml', 90, 1, 3, 9),
  ('soupe de légumes maison', '100ml', 35, 1.5, 5, 1),
  ('œuf', 'piece', 70, 6.3, 0.4, 4.8),
  ('œuf dur', 'piece', 70, 6.3, 0.4, 4.8),
  ('œufs', 'piece', 70, 6.3, 0.4, 4.8),
  ('œufs durs', 'piece', 70, 6.3, 0.4, 4.8),
  ('banane', 'piece', 108, 1.4, 24, 0.4),
  ('banane écrasée', 'piece', 108, 1.4, 24, 0.4),
  ('pomme', 'piece', 78, 0.5, 21, 0.3),
  ('kiwi', 'piece', 46, 0.8, 11, 0.4),
  ('fruit', 'piece', 95, 1, 22, 0.3),
  ('grosses tomates', 'piece', 27, 1.4, 4.5, 0.3),
  ('crackers complets', 'piece', 36, 0.8, 5.6, 1),
  ('pistolet complet', 'piece', 135, 4.5, 25, 1),
  ('wraps complets', 'piece', 130, 3.5, 21, 3),
  ('barre protéinée', 'piece', 200, 20, 18, 7),
  ('avocat', 'piece', 240, 3, 13, 22),
  ('épices (paprika, curry, ail, herbes)', 'portion', 5, 0.3, 1, 0.1),
  ('épices chili', 'portion', 5, 0.3, 1, 0.1),
  ('ras el hanout', 'portion', 5, 0.3, 1, 0.1),
  ('curry + gingembre', 'portion', 5, 0.3, 1, 0.1),
  ('citron + aneth', 'portion', 3, 0.1, 0.5, 0),
  ('basilic + balsamique', 'portion', 15, 0.2, 2, 0.5),
  ('sauce soja réduite en sel + gingembre', 'portion', 12, 1.5, 1.5, 0),
  ('sauce soja réduite en sel + gingembre + ail', 'portion', 12, 1.5, 1.5, 0),
  ('sauce soja réduite en sel + sésame', 'portion', 20, 1.5, 1.5, 1.2),
  ('moutarde + citron', 'portion', 15, 1, 1, 1),
  ('sauce yaourt-citron', 'portion', 35, 2.5, 3, 1.5),
  ('sauce teriyaki (soja, miel, gingembre)', 'portion', 40, 2, 7, 0.1),
  ('jus de citron, sel, poivre', 'portion', 3, 0.1, 0.5, 0),
  ('cannelle', 'portion', 2, 0.1, 0.5, 0);
