-- Lot 29 : proposition automatique de progression de charge.
--
-- Demande PO : « si j'atteins l'objectif 2× d'affilée, la fois d'après j'ai un
-- nouvel objectif de charge qui propose une charge plus élevée selon une
-- progression logique, avec une pastille qui montre que c'est nouveau, et je
-- peux accepter ou pas avec un V ou X ».
--
-- La proposition est CALCULÉE À LA LECTURE (deux dernières séances de
-- l'exercice), pas stockée : une proposition stockée devient fausse dès que la
-- séance suivante est enregistrée ou corrigée. Seul le REFUS se mémorise —
-- sinon la même valeur reviendrait à chaque ouverture d'écran.
--
-- Non cassante : deux colonnes nullables + une fonction. Rien n'est modifié.

alter table exercises
  -- Pas de progression pour CET exercice. Il n'y a pas de pas universel :
  -- +2,5 kg sur une barre, +2 kg par haltère, une plaque sur une machine,
  -- -2 kg d'aide sur un assisté. Null = 2,5 par défaut. Posé par Claude.
  add column progression_step_kg numeric,
  -- Dernière proposition refusée (valeur SIGNÉE, même convention que
  -- target_weight_kg). Tant que la cible n'a pas bougé, on ne la repropose pas.
  add column progression_declined_kg numeric;

comment on column exercises.progression_step_kg is
  'Incrément de charge pour cet exercice, en kg (barre 2.5, haltères 2, '
  'machine 5, assistance 2…). NULL = 2.5 par défaut. Appliqué au poids SIGNÉ : '
  'sur un exercice assisté, -14 + 2 = -12, soit moins d''aide.';
comment on column exercises.progression_declined_kg is
  'Dernière proposition de progression refusée (signée). Empêche de la '
  'reproposer en boucle ; devient caduque dès que la cible change.';

-- Séries des N dernières séances où l'exercice apparaît. « Objectif atteint
-- 2× d'affilée » se juge sur deux séances, pas sur deux séries : sans ça il
-- faudrait rapatrier tout l'historique côté app (ce que le Lot 25 a justement
-- arrêté de faire).
create or replace function recent_sets_by_exercise(
  exercise_ids uuid[],
  sessions int default 2
)
returns table (
  exercise_id uuid,
  workout_id uuid,
  workout_date date,
  session_rank int,
  set_number int,
  reps int,
  weight_kg numeric,
  rpe numeric
)
language sql
stable
security invoker
as $$
  with ranked as (
    select
      ws.exercise_id,
      w.id as workout_id,
      w.workout_date,
      dense_rank() over (
        partition by ws.exercise_id
        order by w.workout_date desc, w.created_at desc
      )::int as session_rank,
      ws.set_number,
      ws.reps,
      ws.weight_kg,
      ws.rpe
    from workout_sets ws
    join workouts w on w.id = ws.workout_id
    where ws.exercise_id = any(exercise_ids)
  )
  select exercise_id, workout_id, workout_date, session_rank,
         set_number, reps, weight_kg, rpe
  from ranked
  where session_rank <= greatest(1, sessions)
  order by exercise_id, session_rank, set_number;
$$;

comment on function recent_sets_by_exercise is
  'Séries des N dernières séances par exercice (session_rank = 1 pour la plus '
  'récente). security invoker : la RLS du demandeur s''applique.';

grant execute on function recent_sets_by_exercise(uuid[], int) to authenticated;
