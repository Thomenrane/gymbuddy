-- Lot 25 : « dernière fois » par exercice, calculée en base.
--
-- getLastSets() téléchargeait TOUTES les séries de chaque exercice demandé pour
-- n'en garder que celles du workout le plus récent : le coût grossit
-- linéairement avec l'historique, à chaque ouverture d'écran séance. Un
-- DISTINCT ON fait le tri côté Postgres et ne renvoie que les séries utiles.
--
-- security invoker : la fonction s'exécute avec les droits de l'appelant, donc
-- les policies RLS de workouts/workout_sets s'appliquent normalement. Aucune
-- élévation de privilège.
--
-- Migration NON CASSANTE : elle n'ajoute qu'une fonction. Tant qu'elle n'est pas
-- appliquée, l'app retombe automatiquement sur l'ancienne requête (repli dans
-- getLastSets), donc l'ordre déploiement / migration n'a aucune importance.
create or replace function latest_sets_by_exercise(exercise_ids uuid[])
returns table (
  exercise_id uuid,
  workout_date date,
  set_number int,
  reps int,
  weight_kg numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with latest as (
    -- Le workout le plus récent de chaque exercice (baselines comprises :
    -- c'est leur raison d'être, cf. src/lib/last-sets.mjs).
    select distinct on (ws.exercise_id)
      ws.exercise_id,
      ws.workout_id,
      w.workout_date
    from workout_sets ws
    join workouts w on w.id = ws.workout_id
    where ws.exercise_id = any(exercise_ids)
    order by ws.exercise_id, w.workout_date desc, w.created_at desc
  )
  select
    l.exercise_id,
    l.workout_date,
    ws.set_number,
    ws.reps,
    ws.weight_kg
  from latest l
  join workout_sets ws
    on ws.exercise_id = l.exercise_id
   and ws.workout_id = l.workout_id
  order by l.exercise_id, ws.set_number;
$$;

comment on function latest_sets_by_exercise(uuid[]) is
  'Séries du workout le plus récent de chaque exercice demandé (ordre '
  'workout_date puis created_at). Remplace un scan complet de workout_sets '
  'côté app. RLS appliquée (security invoker).';

grant execute on function latest_sets_by_exercise(uuid[]) to authenticated;
