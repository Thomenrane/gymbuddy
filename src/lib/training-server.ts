import { createClient } from "@/lib/supabase/server";
import {
  latestSetsByExercise,
  setsFromLatestRows,
  type LastSetRow,
  type LastSets,
  type LatestSetRow,
} from "@/lib/last-sets.mjs";
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

  // Lot 25 : le tri « dernier workout » se fait en base (DISTINCT ON), qui ne
  // renvoie que les séries utiles. L'ancienne requête ramenait TOUT
  // l'historique de chaque exercice pour n'en garder qu'une poignée de lignes.
  const rpc = await supabase.rpc("latest_sets_by_exercise", {
    exercise_ids: exerciseIds,
  });
  if (!rpc.error) {
    return setsFromLatestRows((rpc.data ?? []) as LatestSetRow[]);
  }
  // Le repli n'existe que pour UN cas : la fonction n'est pas encore en base
  // (PGRST202 côté PostgREST, 42883 côté Postgres). Traiter n'importe quelle
  // erreur comme « migration absente » ferait retomber silencieusement et
  // définitivement sur le scan complet que ce lot supprime — un timeout ou un
  // droit révoqué passerait pour normal. Tout le reste doit remonter.
  const missing =
    rpc.error.code === "PGRST202" ||
    rpc.error.code === "42883" ||
    /does not exist|could not find the function/i.test(rpc.error.message ?? "");
  if (!missing) {
    throw new Error(`getLastSets (rpc): ${rpc.error.message}`);
  }
  console.warn(
    "latest_sets_by_exercise absente : repli sur le scan complet. Appliquer supabase/migrations/20260902000001_latest_sets_rpc.sql."
  );

  // Repli : migration pas encore appliquée. L'ordre déploiement / migration n'a
  // donc aucune importance, et le résultat est identique (prouvé par
  // scripts/last-sets.test.mjs).
  const { data, error } = await supabase
    .from("workout_sets")
    .select(
      "exercise_id, set_number, reps, weight_kg, workout:workouts!inner(id, workout_date, created_at)"
    )
    .in("exercise_id", exerciseIds);
  if (error) throw new Error(`getLastSets: ${error.message}`);
  return latestSetsByExercise((data ?? []) as unknown as LastSetRow[]);
}


/**
 * Lot 29 : les N dernières SÉANCES par exercice (pas les N dernières séries),
 * pour juger « objectif atteint 2× d'affilée ».
 *
 * Comme au Lot 25, le tri est fait en base : rapatrier tout l'historique pour
 * garder deux séances serait un retour en arrière. Si la fonction n'est pas
 * encore appliquée, on renvoie une carte VIDE — aucune proposition ne sera
 * faite, ce qui est le bon défaut : mieux vaut ne rien proposer que proposer
 * sur des données tronquées.
 */
export async function getRecentSessions(
  exerciseIds: string[],
  sessions = 2
): Promise<Map<string, { sets: { reps: number | null; weight_kg: number | null; rpe: number | null }[] }[]>> {
  const out = new Map<
    string,
    { sets: { reps: number | null; weight_kg: number | null; rpe: number | null }[] }[]
  >();
  if (exerciseIds.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recent_sets_by_exercise", {
    exercise_ids: exerciseIds,
    sessions,
  });
  if (error) {
    console.warn(
      `recent_sets_by_exercise indisponible (${error.message}) : aucune proposition de progression. ` +
        "Appliquer supabase/migrations/20260903000003_progression.sql."
    );
    return out;
  }
  type Row = {
    exercise_id: string;
    session_rank: number;
    reps: number | null;
    weight_kg: number | null;
    rpe: number | null;
  };
  // session_rank = 1 pour la séance la plus récente : le module de progression
  // attend exactement cet ordre.
  const byExercise = new Map<string, Map<number, Row[]>>();
  for (const r of (data ?? []) as Row[]) {
    const ranks = byExercise.get(r.exercise_id) ?? new Map<number, Row[]>();
    ranks.set(r.session_rank, [...(ranks.get(r.session_rank) ?? []), r]);
    byExercise.set(r.exercise_id, ranks);
  }
  for (const [exerciseId, ranks] of byExercise) {
    out.set(
      exerciseId,
      [...ranks.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, rows]) => ({
          sets: rows.map((r) => ({ reps: r.reps, weight_kg: r.weight_kg, rpe: r.rpe })),
        }))
    );
  }
  return out;
}
