-- RPC de vérification mécanique (scripts/verify-phaseN.sh).
-- SECURITY DEFINER + exécutable par anon : n'expose QUE des métadonnées
-- agrégées (liste des tables du schéma public + comptages), aucune donnée.
-- Nécessaire car la clé service_role n'est pas disponible dans toutes les
-- sessions de dev — la clé publishable suffit alors au script de verify.
create or replace function verify_phase0()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tables', (
      select coalesce(jsonb_agg(tablename order by tablename), '[]'::jsonb)
      from pg_tables where schemaname = 'public'
    ),
    'rls_enabled_count', (
      select count(*) from pg_tables
      where schemaname = 'public' and rowsecurity
    ),
    'recipes', (select count(*) from recipes),
    'exercises', (select count(*) from exercises),
    'workout_templates', (select count(*) from workout_templates),
    'template_exercises', (select count(*) from template_exercises),
    'baseline_workouts', (
      select count(*) from workouts
      where notes = 'baseline seed — poids de départ'
    ),
    'baseline_sets_with_weight', (
      select count(*) from workout_sets ws
      join workouts w on w.id = ws.workout_id
      where w.notes = 'baseline seed — poids de départ'
        and ws.weight_kg is not null
    ),
    'baseline_sets_total', (
      select count(*) from workout_sets ws
      join workouts w on w.id = ws.workout_id
      where w.notes = 'baseline seed — poids de départ'
    ),
    'targets_kcal', (select kcal from targets where id = 1)
  )
$$;

revoke all on function verify_phase0() from public;
grant execute on function verify_phase0() to anon, authenticated;
