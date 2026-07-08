// Génère supabase/seed.sql depuis seed/*.json (source de vérité, non modifiés).
// Idempotent : ON CONFLICT DO NOTHING sur les clés naturelles (recipes.code,
// exercises.name) et garde IF NOT EXISTS par nom de template.
// Usage : node scripts/generate-seed-sql.mjs
import { readFileSync, writeFileSync } from "node:fs";

const recipesSeed = JSON.parse(readFileSync("seed/recipes-seed.json", "utf8"));
const workoutSeed = JSON.parse(
  readFileSync("seed/workout-templates-seed.json", "utf8")
);

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const qOrNull = (s) => (s === undefined || s === null ? "null" : q(s));
const num = (n) => (n === undefined || n === null ? "null" : String(n));
const textArray = (arr) =>
  arr && arr.length ? `array[${arr.map(q).join(",")}]` : "null";
// Fourchette "4-6" → [4, 6] ; "10" → [10, 10]
const parseReps = (s) => {
  const [min, max] = String(s).split("-").map(Number);
  return [min, max ?? min];
};

let sql = `-- GÉNÉRÉ par scripts/generate-seed-sql.mjs — ne pas éditer à la main.
-- Sources : seed/recipes-seed.json + seed/workout-templates-seed.json

-- ---------- Cibles ----------
insert into targets (id, kcal, protein_g, carbs_g, fat_g, fiber_g)
values (1, ${recipesSeed.targets.kcal}, ${recipesSeed.targets.protein_g}, ${recipesSeed.targets.carbs_g}, ${recipesSeed.targets.fat_g}, ${recipesSeed.targets.fiber_g})
on conflict (id) do nothing;

-- ---------- Recettes (${recipesSeed.recipes.length}) ----------
`;

for (const r of recipesSeed.recipes) {
  sql += `insert into recipes (code, name, category, kcal, protein_g, carbs_g, fat_g, ingredients, steps, prep_min, tags, source)
values (${q(r.code)}, ${q(r.name)}, ${q(r.category)}, ${r.kcal}, ${r.protein_g}, ${r.carbs_g}, ${r.fat_g}, ${q(JSON.stringify(r.ingredients))}::jsonb, ${textArray(r.steps)}, ${num(r.prep_min)}, ${textArray(r.tags)}, 'plan')
on conflict (code) do nothing;
`;
}

sql += `
-- ---------- Catalogue d'exercices (${workoutSeed.exercises_catalog.length}) ----------
`;
for (const e of workoutSeed.exercises_catalog) {
  sql += `insert into exercises (name, muscle_group, measure_type, note)
values (${q(e.name)}, ${q(e.muscle_group)}, ${q(e.measure_type)}, ${qOrNull(e.note)})
on conflict (name) do nothing;
`;
}

sql += `
-- ---------- Templates + baselines (AMENDEMENT 2) ----------
-- 1 workout baseline par template, daté du jour du seed (Europe/Brussels),
-- sets aux poids de départ (current_weight_kg), reps = bas de fourchette.
do $seed$
declare
  tpl_id uuid;
  wk_id uuid;
  ex_id uuid;
begin
`;

for (const t of workoutSeed.workout_templates) {
  sql += `  if not exists (select 1 from workout_templates where name = ${q(t.name)}) then
    insert into workout_templates (name, type) values (${q(t.name)}, ${q(t.type)})
      returning id into tpl_id;
    insert into workouts (workout_date, type, template_id, notes)
      values ((now() at time zone 'Europe/Brussels')::date, ${q(t.type)}, tpl_id,
              'baseline seed — poids de départ')
      returning id into wk_id;
`;
  for (const ex of t.exercises) {
    const [repsMin, repsMax] = parseReps(ex.default_reps);
    sql += `    select id into ex_id from exercises where name = ${q(ex.exercise)};
    insert into template_exercises (template_id, exercise_id, position, default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds)
      values (tpl_id, ex_id, ${ex.position}, ${ex.default_sets}, ${repsMin}, ${repsMax}, ${ex.target_rpe}, ${ex.rest_seconds});
    insert into workout_sets (workout_id, exercise_id, position, set_number, reps, weight_kg)
      select wk_id, ex_id, ${ex.position}, s, ${repsMin}, ${num(ex.current_weight_kg)}
      from generate_series(1, ${ex.default_sets}) s;
`;
  }
  sql += `  end if;
`;
}

sql += `end $seed$;
`;

writeFileSync("supabase/seed.sql", sql);
console.log(
  `supabase/seed.sql généré : ${recipesSeed.recipes.length} recettes, ` +
    `${workoutSeed.exercises_catalog.length} exos, ` +
    `${workoutSeed.workout_templates.length} templates.`
);
