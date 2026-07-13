-- Lot 18 : note texte libre PAR EXERCICE dans une séance. Les chiffres d'une
-- série (reps, poids, RPE) ne capturent pas le contexte qualitatif ("assistance
-- -14 pour tenir propre", "douleur épaule") — sans lui, Claude fait de
-- mauvaises inférences en lisant les données brutes. La note est attachée à
-- (workout × exercice), pas à chaque série (sur-granularité inutile), et reste
-- DISTINCTE de la note de séance globale (workouts.notes). Non cassante :
-- table nouvelle, séances/sets existants intacts, note absente = null.
create table workout_exercise_notes (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts on delete cascade,
  exercise_id uuid not null references exercises,
  note text not null,
  created_at timestamptz not null default now(),
  -- une seule note par (séance, exercice) : la ré-écrire remplace.
  unique (workout_id, exercise_id)
);
-- get_exercise_history lit par exercice, tous workouts confondus.
create index workout_exercise_notes_exercise_idx on workout_exercise_notes (exercise_id);

alter table workout_exercise_notes enable row level security;
create policy owner_all on workout_exercise_notes
  for all to authenticated using (is_owner()) with check (is_owner());
