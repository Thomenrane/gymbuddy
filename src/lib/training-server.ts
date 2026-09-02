import { createClient } from "@/lib/supabase/server";
import { latestSetsByExercise, type LastSetRow, type LastSets } from "@/lib/last-sets.mjs";
import type {
  Exercise,
  Workout,
  WorkoutTemplate,
} from "@/lib/training";

export async function getMonthWorkouts(
  firstDay: string,
  lastDay: string
): Promise<Workout[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workouts")
    .select("*")
    .gte("workout_date", firstDay)
    .lte("workout_date", lastDay)
    .order("workout_date");
  if (error) throw new Error(`getMonthWorkouts: ${error.message}`);
  return (data ?? []) as Workout[];
}

export async function getDayWorkouts(date: string): Promise<Workout[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workouts")
    .select("*, workout_sets(*, exercise:exercises(name))")
    .eq("workout_date", date)
    .order("created_at");
  if (error) throw new Error(`getDayWorkouts: ${error.message}`);
  return (data ?? []) as Workout[];
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select("*, workout_sets(*, exercise:exercises(name)), exercise_notes:workout_exercise_notes(exercise_id, note)")
    .eq("id", id)
    .maybeSingle();
  return data as Workout | null;
}

export async function getActiveTemplates(): Promise<WorkoutTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_templates")
    .select("*, template_exercises(*, exercise:exercises(*))")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`getActiveTemplates: ${error.message}`);
  return ((data ?? []) as WorkoutTemplate[]).map(sortTemplateExercises);
}

export async function getTemplate(id: string): Promise<WorkoutTemplate | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_templates")
    .select("*, template_exercises(*, exercise:exercises(*))")
    .eq("id", id)
    .maybeSingle();
  return data ? sortTemplateExercises(data as WorkoutTemplate) : null;
}

function sortTemplateExercises(t: WorkoutTemplate): WorkoutTemplate {
  t.template_exercises?.sort((a, b) => a.position - b.position);
  return t;
}

export async function getExerciseCatalog(): Promise<Exercise[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .order("name");
  if (error) throw new Error(`getExerciseCatalog: ${error.message}`);
  return (data ?? []) as Exercise[];
}

/**
 * Contexte complet d'UN exercice, pour l'ajouter en cours de séance avec les
 * mêmes informations qu'un exercice de template (Lot 20) : ses consignes, sa
 * cible de poids et sa dernière perf.
 *
 * Les consignes (séries, fourchette, RPE, repos) sont une propriété du
 * TEMPLATE, pas de l'exercice : on prend celles du template actif qui le
 * contient, par ordre alphabétique quand il y en a plusieurs (déterministe).
 * Aucun template → pas de consignes, on retombe sur la dernière perf.
 */
export async function getExerciseContext(exerciseId: string): Promise<{
  exercise: Exercise;
  defaults: TemplateDefaults | null;
  last: LastSets | null;
} | null> {
  const supabase = await createClient();
  const [exerciseRes, templateRes, lastMap] = await Promise.all([
    supabase.from("exercises").select("*").eq("id", exerciseId).maybeSingle(),
    supabase
      .from("template_exercises")
      .select(
        "default_sets, default_reps_min, default_reps_max, target_rpe, rest_seconds, template:workout_templates!inner(name, is_active)"
      )
      .eq("exercise_id", exerciseId)
      .eq("template.is_active", true),
    getLastSets([exerciseId]),
  ]);
  if (!exerciseRes.data) return null;

  const rows = (templateRes.data ?? []) as unknown as TemplateDefaultsRow[];
  const pick = [...rows].sort((a, b) =>
    (a.template?.name ?? "").localeCompare(b.template?.name ?? "")
  )[0];

  return {
    exercise: exerciseRes.data as Exercise,
    defaults: pick
      ? {
          sets: pick.default_sets,
          repsMin: pick.default_reps_min,
          repsMax: pick.default_reps_max,
          rpe: pick.target_rpe,
          rest: pick.rest_seconds,
        }
      : null,
    last: lastMap.get(exerciseId) ?? null,
  };
}

export type TemplateDefaults = {
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  rpe: number | null;
  rest: number | null;
};

type TemplateDefaultsRow = {
  default_sets: number | null;
  default_reps_min: number | null;
  default_reps_max: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  template: { name: string; is_active: boolean } | null;
};

/**
 * Référence "dernière fois" pour chaque exercice demandé : les sets de son
 * workout le plus récent (baselines comprises). Cœur du pré-remplissage.
 */
export async function getLastSets(
  exerciseIds: string[]
): Promise<Map<string, LastSets>> {
  if (exerciseIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_sets")
    .select(
      "exercise_id, set_number, reps, weight_kg, workout:workouts!inner(id, workout_date, created_at)"
    )
    .in("exercise_id", exerciseIds);
  if (error) throw new Error(`getLastSets: ${error.message}`);
  return latestSetsByExercise((data ?? []) as unknown as LastSetRow[]);
}
