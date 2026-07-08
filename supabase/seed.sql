-- GÉNÉRÉ par scripts/generate-seed-sql.mjs — ne pas éditer à la main.
-- Sources : seed/recipes-seed.json + seed/workout-templates-seed.json

-- ---------- Cibles ----------
insert into targets (id, kcal, protein_g, carbs_g, fat_g, fiber_g)
values (1, 2270, 170, 227, 76, 38)
on conflict (id) do nothing;

-- ---------- Recettes (32) ----------
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('PD1', 'Bowl skyr granola', 'petit_dej', 520, 41, 49, 15, '[{"item":"skyr nature","qty":300,"unit":"g"},{"item":"granola sans sucres ajoutés","qty":40,"unit":"g"},{"item":"fruits rouges surgelés","qty":125,"unit":"g"},{"item":"amandes","qty":15,"unit":"g"}]'::jsonb, array['Tout assembler dans un bol.'], 2, array['rapide'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('PD2', 'Œufs + pain complet', 'petit_dej', 555, 42, 55, 17, '[{"item":"œufs","qty":3,"unit":"pièce"},{"item":"beurre","qty":5,"unit":"g"},{"item":"pain complet","qty":70,"unit":"g","note":"2 tranches"},{"item":"skyr nature","qty":150,"unit":"g","note":"dessert"},{"item":"fruit","qty":1,"unit":"pièce"}]'::jsonb, array['Omelette ou œufs au plat avec 5 g de beurre max.','Servir avec le pain, skyr et fruit en dessert.'], 10, array['oeufs'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('PD3', 'Porridge protéiné whey', 'petit_dej', 525, 39, 70, 7, '[{"item":"flocons d''avoine","qty":60,"unit":"g"},{"item":"whey","qty":30,"unit":"g"},{"item":"lait demi-écrémé","qty":200,"unit":"ml"},{"item":"banane","qty":1,"unit":"pièce"}]'::jsonb, array['Cuire l''avoine dans le lait 3 min micro-ondes.','Incorporer la whey hors du feu, banane en rondelles.'], 5, array['rapide','pre-training'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('PD4', 'Overnight oats', 'petit_dej', 500, 36, 58, 10, '[{"item":"flocons d''avoine","qty":50,"unit":"g"},{"item":"lait demi-écrémé","qty":150,"unit":"ml"},{"item":"skyr nature","qty":200,"unit":"g"},{"item":"myrtilles","qty":100,"unit":"g"},{"item":"graines de chia","qty":10,"unit":"g"}]'::jsonb, array['Mélanger la veille, frigo toute la nuit.'], 5, array['meal-prep'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('PD5', 'Pancakes protéinés', 'petit_dej', 520, 36, 67, 9, '[{"item":"flocons d''avoine mixés","qty":60,"unit":"g"},{"item":"œuf","qty":1,"unit":"pièce"},{"item":"banane écrasée","qty":1,"unit":"pièce"},{"item":"skyr nature","qty":200,"unit":"g","note":"topping"},{"item":"fruits rouges ou sirop 0%","qty":50,"unit":"g"}]'::jsonb, array['Mixer avoine + œuf + banane.','Cuire en petits pancakes, topping skyr + fruits.'], 15, array['weekend','oeufs'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('PD6', 'Tartines cottage cheese', 'petit_dej', 570, 38, 50, 14, '[{"item":"pain complet","qty":105,"unit":"g","note":"3 tranches"},{"item":"cottage cheese","qty":200,"unit":"g"},{"item":"œuf dur","qty":1,"unit":"pièce"},{"item":"tomates cerises","qty":80,"unit":"g"},{"item":"kiwi","qty":1,"unit":"pièce"}]'::jsonb, array['Tartiner, garnir, assaisonner poivre/ciboulette.'], 5, array['rapide','oeufs'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('PD7', 'Smoothie protéiné', 'petit_dej', 490, 39, 50, 12, '[{"item":"whey","qty":30,"unit":"g"},{"item":"lait demi-écrémé","qty":200,"unit":"ml"},{"item":"flocons d''avoine","qty":40,"unit":"g"},{"item":"fruits rouges","qty":100,"unit":"g"},{"item":"beurre de cacahuète","qty":10,"unit":"g"}]'::jsonb, array['Tout mixer.'], 3, array['rapide','a-emporter'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('L1', 'Tomate-mozza corrigée', 'dejeuner', 560, 55, 32, 20, '[{"item":"mozzarella light","qty":125,"unit":"g"},{"item":"thon au naturel égoutté","qty":100,"unit":"g","note":"ou poulet cuit"},{"item":"grosses tomates","qty":2,"unit":"pièce"},{"item":"pain complet","qty":70,"unit":"g","note":"2 tranches"},{"item":"huile d''olive","qty":5,"unit":"g"},{"item":"basilic + balsamique","qty":1,"unit":"portion"}]'::jsonb, array['Assembler, assaisonner.'], 5, array['rapide','poisson'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('L2', 'Salade poulet quinoa', 'dejeuner', 565, 48, 50, 15, '[{"item":"blanc de poulet","qty":180,"unit":"g","note":"cru"},{"item":"quinoa","qty":60,"unit":"g","note":"cru"},{"item":"crudités (concombre, poivron, tomates cerises, carottes)","qty":200,"unit":"g"},{"item":"huile d''olive","qty":10,"unit":"g"},{"item":"moutarde + citron","qty":1,"unit":"portion"}]'::jsonb, array['Cuire poulet et quinoa (meal prep dimanche, 3 portions).','Assembler froid avec la vinaigrette.'], 20, array['meal-prep'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('L3', 'Wraps poulet crudités', 'dejeuner', 550, 45, 42, 14, '[{"item":"wraps complets","qty":2,"unit":"pièce"},{"item":"blanc de poulet","qty":150,"unit":"g","note":"cru"},{"item":"fromage frais léger","qty":30,"unit":"g"},{"item":"crudités","qty":150,"unit":"g","note":"à volonté"}]'::jsonb, array['Cuire le poulet en lanières, garnir, rouler.'], 10, array['rapide'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('L4', 'Salade de pâtes au thon', 'dejeuner', 555, 47, 60, 13, '[{"item":"pâtes complètes","qty":70,"unit":"g","note":"cru"},{"item":"thon au naturel","qty":150,"unit":"g"},{"item":"crudités","qty":100,"unit":"g"},{"item":"maïs","qty":50,"unit":"g"},{"item":"huile d''olive","qty":10,"unit":"g"}]'::jsonb, array['Cuire les pâtes, refroidir, assembler.'], 15, array['pates','poisson','meal-prep'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('L5', 'Soupe-repas + tartines poulet', 'dejeuner', 555, 45, 55, 10, '[{"item":"soupe de légumes maison","qty":400,"unit":"ml"},{"item":"pain complet","qty":70,"unit":"g","note":"2 tranches"},{"item":"poulet cuit","qty":100,"unit":"g"},{"item":"fromage léger","qty":30,"unit":"g"},{"item":"fruit","qty":1,"unit":"pièce"}]'::jsonb, array['Réchauffer la soupe, tartines garnies à côté.'], 10, array['hiver'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('L6', 'Pistolet complet saumon fumé', 'dejeuner', 505, 49, 35, 16, '[{"item":"pistolet complet","qty":1,"unit":"pièce"},{"item":"saumon fumé","qty":100,"unit":"g"},{"item":"fromage frais léger","qty":50,"unit":"g"},{"item":"concombre","qty":80,"unit":"g"},{"item":"skyr nature","qty":150,"unit":"g","note":"dessert"}]'::jsonb, array['Garnir le pistolet, skyr en dessert.'], 5, array['rapide','poisson'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('L7', 'Poke bowl maison', 'dejeuner', 545, 40, 62, 14, '[{"item":"riz brun","qty":70,"unit":"g","note":"cru"},{"item":"thon frais ou saumon","qty":120,"unit":"g","note":"qualité sashimi ou cuit"},{"item":"edamame","qty":50,"unit":"g"},{"item":"concombre + carotte râpée","qty":100,"unit":"g"},{"item":"sauce soja réduite en sel + sésame","qty":1,"unit":"portion"}]'::jsonb, array['Cuire le riz, dresser le bowl.'], 15, array['poisson'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('C1', 'Skyr noix fruit', 'collation', 330, 24, 30, 12, '[{"item":"skyr nature","qty":200,"unit":"g"},{"item":"noix non salées","qty":20,"unit":"g"},{"item":"pomme","qty":1,"unit":"pièce"}]'::jsonb, array['Assembler.'], 1, array['rapide'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('C2', 'Fromage blanc chocolaté', 'collation', 350, 28, 35, 10, '[{"item":"fromage blanc maigre","qty":250,"unit":"g"},{"item":"cacao non sucré","qty":10,"unit":"g"},{"item":"banane","qty":1,"unit":"pièce"},{"item":"beurre de cacahuète","qty":10,"unit":"g"}]'::jsonb, array['Mélanger cacao + fromage blanc (+ édulcorant si besoin).'], 3, array['anti-sucre'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('C3', 'Shake whey lait fruit', 'collation', 350, 33, 28, 12, '[{"item":"whey","qty":30,"unit":"g"},{"item":"lait demi-écrémé","qty":250,"unit":"ml"},{"item":"fruit","qty":1,"unit":"pièce"},{"item":"amandes","qty":15,"unit":"g"}]'::jsonb, array['Shaker.'], 2, array['rapide','post-training'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('C4', 'Cottage crackers', 'collation', 290, 20, 25, 8, '[{"item":"cottage cheese","qty":150,"unit":"g"},{"item":"crackers complets","qty":4,"unit":"pièce"},{"item":"tomates cerises","qty":80,"unit":"g"}]'::jsonb, array['Assembler.'], 2, array['rapide'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('C5', 'Œufs durs skyr fruit', 'collation', 300, 25, 22, 11, '[{"item":"œufs durs","qty":2,"unit":"pièce"},{"item":"skyr nature","qty":100,"unit":"g"},{"item":"fruit","qty":1,"unit":"pièce"}]'::jsonb, array['Œufs cuits d''avance au meal prep.'], 2, array['oeufs','meal-prep'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('C6', 'Barre protéinée + fruit + noix', 'collation', 340, 22, 30, 12, '[{"item":"barre protéinée","qty":1,"unit":"pièce","note":"min 20 g P, max 3 g sucre"},{"item":"fruit","qty":1,"unit":"pièce"},{"item":"noix","qty":10,"unit":"g"}]'::jsonb, array['—'], 0, array['a-emporter'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('C7', 'Yaourt grec granola kiwi', 'collation', 260, 23, 28, 6, '[{"item":"yaourt grec 0%","qty":200,"unit":"g"},{"item":"granola sans sucres ajoutés","qty":20,"unit":"g"},{"item":"kiwi","qty":1,"unit":"pièce"}]'::jsonb, array['Assembler.'], 1, array['rapide'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('D1', 'Poulet riz brun légumes', 'diner', 660, 47, 75, 15, '[{"item":"blanc de poulet ou dinde","qty":180,"unit":"g","note":"cru"},{"item":"riz brun","qty":80,"unit":"g","note":"cru"},{"item":"légumes surgelés en mélange","qty":300,"unit":"g"},{"item":"huile d''olive","qty":10,"unit":"g"},{"item":"épices (paprika, curry, ail, herbes)","qty":1,"unit":"portion"}]'::jsonb, array['Cuire le riz.','Poêler le poulet épicé, ajouter les légumes.'], 25, array['classique'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('D2', 'Saumon pommes de terre', 'diner', 690, 52, 60, 22, '[{"item":"pavé de saumon","qty":150,"unit":"g"},{"item":"pommes de terre vapeur","qty":250,"unit":"g"},{"item":"brocoli ou haricots verts","qty":300,"unit":"g"},{"item":"citron + aneth","qty":1,"unit":"portion"},{"item":"skyr nature","qty":150,"unit":"g","note":"dessert"}]'::jsonb, array['Saumon au four 12-15 min à 200°C.','Pas de matière grasse ajoutée.'], 25, array['poisson','poisson-gras'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('D3', 'Bolognaise complète', 'diner', 640, 48, 72, 13, '[{"item":"haché de bœuf 5% MG","qty":150,"unit":"g"},{"item":"pâtes complètes","qty":80,"unit":"g","note":"cru — à peser"},{"item":"sauce tomate nature","qty":200,"unit":"g"},{"item":"légumes dans la sauce (courgette, poivron, champignons)","qty":150,"unit":"g"}]'::jsonb, array['Revenir le haché, ajouter légumes puis sauce, mijoter 15 min.'], 25, array['pates','hache'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('D4', 'Wok crevettes riz brun', 'diner', 600, 45, 68, 13, '[{"item":"crevettes décortiquées","qty":200,"unit":"g"},{"item":"riz brun","qty":75,"unit":"g","note":"cru"},{"item":"wok de légumes surgelés","qty":300,"unit":"g"},{"item":"huile de sésame","qty":10,"unit":"g"},{"item":"sauce soja réduite en sel + gingembre","qty":1,"unit":"portion"}]'::jsonb, array['Wok légumes puis crevettes, servir sur le riz.'], 15, array['poisson','rapide'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('D5', 'Chili con carne (1 portion)', 'diner', 650, 46, 78, 12, '[{"item":"haché de bœuf 5% MG","qty":140,"unit":"g"},{"item":"haricots rouges égouttés","qty":100,"unit":"g"},{"item":"riz brun","qty":60,"unit":"g","note":"cru"},{"item":"tomates concassées","qty":200,"unit":"g"},{"item":"poivron + oignon","qty":150,"unit":"g"},{"item":"épices chili","qty":1,"unit":"portion"}]'::jsonb, array['Préparer 4 portions au meal prep, congeler 2.'], 40, array['hache','legumineuses','meal-prep'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('D6', 'Cabillaud purée épinards', 'diner', 655, 58, 65, 13, '[{"item":"cabillaud","qty":200,"unit":"g"},{"item":"purée maison (pdt + lait, sans beurre)","qty":300,"unit":"g"},{"item":"épinards ou haricots","qty":300,"unit":"g"},{"item":"huile d''olive","qty":10,"unit":"g"},{"item":"skyr nature","qty":150,"unit":"g","note":"dessert"}]'::jsonb, array['Cabillaud vapeur ou four, purée au lait.'], 30, array['poisson'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('D7', 'Curry de poulet léger', 'diner', 620, 47, 62, 12, '[{"item":"blanc de poulet","qty":180,"unit":"g","note":"cru"},{"item":"riz brun","qty":70,"unit":"g","note":"cru"},{"item":"légumes (poivron, courgette, oignon)","qty":200,"unit":"g"},{"item":"lait de coco light","qty":100,"unit":"ml"},{"item":"curry + gingembre","qty":1,"unit":"portion"}]'::jsonb, array['Revenir poulet et légumes, ajouter lait de coco + curry, mijoter 10 min.'], 25, array['classique'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('D8', 'Tajine poulet pois chiches', 'diner', 600, 48, 65, 10, '[{"item":"blanc de poulet","qty":150,"unit":"g","note":"cru"},{"item":"pois chiches cuits","qty":150,"unit":"g"},{"item":"semoule complète","qty":40,"unit":"g","note":"cru"},{"item":"légumes (courgette, carotte, tomate)","qty":200,"unit":"g"},{"item":"ras el hanout","qty":1,"unit":"portion"}]'::jsonb, array['Mijoter poulet + légumes + pois chiches aux épices, servir sur semoule.'], 30, array['legumineuses'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('X1', 'Extra : carré chocolat noir + fruit', 'collation', 130, 1, 25, 5, '[{"item":"chocolat noir 85%","qty":10,"unit":"g"},{"item":"fruit","qty":1,"unit":"pièce"}]'::jsonb, array['1x/jour max, assumé.'], 0, array['extra','anti-sucre'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('X2', 'Extra : soupe de légumes (entrée)', 'collation', 80, 3, 12, 2, '[{"item":"soupe de légumes maison","qty":300,"unit":"ml"}]'::jsonb, array['En entrée du dîner pour éviter la deuxième portion.'], 2, array['extra','anti-faim'], 'plan')
on conflict (code) do nothing;
insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values ('X3', 'Extra : fruit + poignée de noix', 'collation', 170, 4, 22, 8, '[{"item":"fruit","qty":1,"unit":"pièce"},{"item":"noix non salées","qty":15,"unit":"g"}]'::jsonb, array['—'], 0, array['extra'], 'plan')
on conflict (code) do nothing;

-- ---------- Catalogue d'exercices (13) ----------
insert into exercises (name, muscle_group, measure_type, note)
values ('Back Squat', 'jambes', 'reps', null)
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Barbell Bench Press', 'pecs', 'reps', null)
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Pull-Ups', 'dos', 'reps', 'poids négatif = assistance')
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Chin-Ups', 'dos', 'reps', null)
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Dumbbell Lateral Raises', 'épaules', 'reps', 'poids par haltère')
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Sit-Ups déclinés lestés', 'core', 'reps', 'poids du disque tenu')
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Romanian Deadlift (haltères)', 'jambes', 'reps', 'poids par haltère')
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Tirage poulie basse', 'dos', 'reps', 'machine Basic Fit')
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Overhead Cable Triceps Extension', 'bras', 'reps', null)
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Standing Barbell Overhead Press', 'épaules', 'reps', null)
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Bulgarian Split Squats', 'jambes', 'reps', 'par jambe')
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Face Pull', 'épaules', 'reps', null)
on conflict (name) do nothing;
insert into exercises (name, muscle_group, measure_type, note)
values ('Press mollets', 'jambes', 'reps', 'hors template — à ajouter à la volée si envie, superset possible avec lateral raises')
on conflict (name) do nothing;

-- ---------- Templates + baselines (AMENDEMENT 2) ----------
-- 1 workout baseline par template, daté du jour du seed (Europe/Brussels),
-- sets aux poids de départ (current_weight_kg), reps = bas de fourchette.
do $seed$
declare
  tpl_id uuid;
  wk_id uuid;
  ex_id uuid;
begin
  if not exists (select 1 from workout_templates where name = 'Day 1 — Lourd (force)') then
    insert into workout_templates (name, type) values ('Day 1 — Lourd (force)', 'muscu')
      returning id into tpl_id;
    insert into workouts (workout_date, type, template_id, notes)
      values ((now() at time zone 'Europe/Brussels')::date, 'muscu', tpl_id,
              'baseline seed — poids de départ')
      returning id into wk_id;
    select id into ex_id from exercises where name = 'Back Squat';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 1, 3, 4, 6, 8, 150);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 1, s, 4, 70
      from generate_series(1, 3) s;
    select id into ex_id from exercises where name = 'Barbell Bench Press';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 2, 4, 4, 6, 8, 150);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 2, s, 4, 60
      from generate_series(1, 4) s;
    select id into ex_id from exercises where name = 'Pull-Ups';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 3, 4, 6, 8, 8, 120);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 3, s, 6, -9
      from generate_series(1, 4) s;
    select id into ex_id from exercises where name = 'Dumbbell Lateral Raises';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 4, 3, 12, 15, 8, 70);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 4, s, 12, 8
      from generate_series(1, 3) s;
    select id into ex_id from exercises where name = 'Sit-Ups déclinés lestés';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 5, 3, 10, 15, 8, 75);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 5, s, 10, 10
      from generate_series(1, 3) s;
  end if;
  if not exists (select 1 from workout_templates where name = 'Day 2 — Volume (hypertrophie)') then
    insert into workout_templates (name, type) values ('Day 2 — Volume (hypertrophie)', 'muscu')
      returning id into tpl_id;
    insert into workouts (workout_date, type, template_id, notes)
      values ((now() at time zone 'Europe/Brussels')::date, 'muscu', tpl_id,
              'baseline seed — poids de départ')
      returning id into wk_id;
    select id into ex_id from exercises where name = 'Romanian Deadlift (haltères)';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 1, 3, 6, 8, 8, 120);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 1, s, 6, 30
      from generate_series(1, 3) s;
    select id into ex_id from exercises where name = 'Barbell Bench Press';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 2, 3, 8, 10, 8, 120);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 2, s, 8, 50
      from generate_series(1, 3) s;
    select id into ex_id from exercises where name = 'Tirage poulie basse';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 3, 4, 8, 10, 8, 90);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 3, s, 8, 52
      from generate_series(1, 4) s;
    select id into ex_id from exercises where name = 'Overhead Cable Triceps Extension';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 4, 3, 10, 12, 8, 90);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 4, s, 10, 13
      from generate_series(1, 3) s;
    select id into ex_id from exercises where name = 'Sit-Ups déclinés lestés';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 5, 3, 10, 15, 8, 75);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 5, s, 10, 10
      from generate_series(1, 3) s;
  end if;
  if not exists (select 1 from workout_templates where name = 'Day 3 — Épaules & Power') then
    insert into workout_templates (name, type) values ('Day 3 — Épaules & Power', 'muscu')
      returning id into tpl_id;
    insert into workouts (workout_date, type, template_id, notes)
      values ((now() at time zone 'Europe/Brussels')::date, 'muscu', tpl_id,
              'baseline seed — poids de départ')
      returning id into wk_id;
    select id into ex_id from exercises where name = 'Back Squat';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 1, 4, 5, 7, 8, 150);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 1, s, 5, 70
      from generate_series(1, 4) s;
    select id into ex_id from exercises where name = 'Standing Barbell Overhead Press';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 2, 4, 6, 8, 8, 120);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 2, s, 6, 35
      from generate_series(1, 4) s;
    select id into ex_id from exercises where name = 'Chin-Ups';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 3, 4, 6, 8, 8, 120);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 3, s, 6, null
      from generate_series(1, 4) s;
    select id into ex_id from exercises where name = 'Bulgarian Split Squats';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 4, 3, 8, 10, 8, 90);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 4, s, 8, null
      from generate_series(1, 3) s;
    select id into ex_id from exercises where name = 'Face Pull';
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, 5, 3, 12, 15, 8, 70);
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, 5, s, 12, 13.5
      from generate_series(1, 3) s;
  end if;
end $seed$;
