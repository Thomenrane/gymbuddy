-- ============================================================
-- Gym Buddy — Schéma v2 (PRD-app-recomp-v2 §3 + amendements)
-- ============================================================
-- Décisions PO (2026-07-08) intégrées :
--
-- * AMENDEMENT 1 (modifié par décision PO / FLAG 5) : le format jsonb
--   { reps?, weight_kg?, duration_s?, distance_m? } est remplacé par des
--   colonnes typées NULLABLES sur workout_sets (reps, weight_kg,
--   duration_s, distance_m) + exercises.measure_type. Même flexibilité,
--   mais requêtes SQL de progression propres (Tendances, MCP
--   get_exercise_history).
-- * AMENDEMENT 3 : conventions de poids — weight_kg négatif = assistance
--   (tractions), poids par haltère pour les exos haltères, NULL = poids
--   du corps. La convention de chaque exo est portée par exercises.note.
-- * AMENDEMENT 4 : template_exercises.target_rpe + rest_seconds.
-- * FLAG 6 (décision PO) : default_reps int du PRD remplacé par
--   default_reps_min / default_reps_max (fourchettes "4-6" du programme
--   v4, nécessaires au hint de double progression — AMENDEMENT 5).
-- ============================================================

-- ---------- Cibles journalières ----------
create table targets (
  id int primary key default 1 check (id = 1), -- ligne unique
  kcal int not null default 2270,
  protein_g int not null default 170,
  carbs_g int not null default 227,
  fat_g int not null default 76,
  fiber_g int not null default 38,
  updated_at timestamptz not null default now()
);

-- ---------- Recettes ----------
create table recipes (
  id uuid primary key default gen_random_uuid(),
  code text unique,                -- 'PD1'..'D8', 'X1'..'X3', null pour les nouvelles
  name text not null,
  category text not null check (category in ('petit_dej','dejeuner','collation','diner')),
  kcal int not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  fiber_g numeric,
  ingredients jsonb not null,      -- [{ item, qty, unit, note? }]
  steps text[],
  prep_min int,
  tags text[],
  is_active boolean not null default true,
  source text not null default 'plan' check (source in ('plan','claude','florian')),
  created_at timestamptz not null default now()
);
create index recipes_category_idx on recipes (category) where is_active;

-- ---------- Logs de repas ----------
-- Macros TOUJOURS dénormalisées et figées à l'insertion : modifier une
-- recette ne réécrit jamais l'historique. Override manuel possible.
create table meal_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null,          -- jour LOCAL Europe/Brussels, calculé côté app
  slot text not null check (slot in ('petit_dej','dejeuner','collation','diner','extra')),
  recipe_id uuid references recipes,
  free_label text,                 -- log libre ("resto italien")
  portion_factor numeric not null default 1.0,
  kcal int not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  notes text,
  created_at timestamptz not null default now(),
  check (recipe_id is not null or free_label is not null)
);
create index meal_logs_date_idx on meal_logs (log_date);

-- ---------- Catalogue d'exercices ----------
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  muscle_group text,               -- 'pecs','dos','jambes','épaules','bras','core'
  measure_type text not null default 'reps' check (measure_type in ('reps','duration','distance')),
  note text,                       -- convention de poids (par haltère, assistance…)
  created_at timestamptz not null default now()
);

-- ---------- Templates de séances ----------
create table workout_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('muscu','running','padel','autre')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references workout_templates on delete cascade,
  exercise_id uuid not null references exercises,
  position int not null,
  default_sets int,
  default_reps_min int,            -- fourchette de reps (ex. 4-6)
  default_reps_max int,
  target_rpe int,
  rest_seconds int
);
create index template_exercises_template_idx on template_exercises (template_id);

-- ---------- Séances ----------
create table workouts (
  id uuid primary key default gen_random_uuid(),
  workout_date date not null,
  type text not null check (type in ('muscu','running','padel','autre')),
  template_id uuid references workout_templates,
  duration_min int,
  distance_km numeric,
  run_type text check (run_type in ('normal','intervalles','fractionné','long','récup') or run_type is null),
  perceived_intensity int check (perceived_intensity between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);
create index workouts_date_idx on workouts (workout_date);

-- Une ligne par série. Le "dernier poids par exo" = dernière série de cet
-- exercise_id, tous workouts confondus (ordre workout_date puis set_number).
create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts on delete cascade,
  exercise_id uuid not null references exercises,
  position int not null,
  set_number int not null,
  -- Colonnes typées nullables (remplace le jsonb de l'AMENDEMENT 1, cf. en-tête)
  reps int,
  weight_kg numeric,               -- négatif = assistance ; NULL = poids du corps
  duration_s int,
  distance_m numeric
);
create index workout_sets_exercise_idx on workout_sets (exercise_id);
create index workout_sets_workout_idx on workout_sets (workout_id);

-- ---------- Mesures corporelles ----------
create table body_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null unique, -- upsert par date
  weight_kg numeric,
  waist_cm numeric,
  notes text
);

-- ---------- updated_at automatique sur targets ----------
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger targets_updated_at
  before update on targets
  for each row execute function set_updated_at();

-- ============================================================
-- RLS — app single-user : seul le compte du PO accède aux données.
-- L'email est volontairement en dur (une seule identité autorisée) ;
-- le service_role et le serveur MCP (bearer MCP_SECRET, Phase 4)
-- passent par la clé secrète et ne sont pas concernés par RLS.
-- ============================================================
create function is_owner() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'thomenrane@gmail.com'
$$;

do $$
declare t text;
begin
  foreach t in array array['targets','recipes','meal_logs','exercises',
    'workout_templates','template_exercises','workouts','workout_sets','body_metrics']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())',
      t);
  end loop;
end $$;
