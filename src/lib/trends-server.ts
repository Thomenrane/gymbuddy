import { createClient } from "@/lib/supabase/server";
import { brusselsDay, mondayOf, shiftDay } from "@/lib/brussels-day.mjs";
import {
  exerciseProgression,
  periodAverages,
  sessionsPerWeek,
  weeklyWeightAverages,
  type PeriodAverages,
  type ProgressionPoint,
  type WeekSessions,
  type WeeklyWeight,
} from "@/lib/trends.mjs";
import { oilyFishCount } from "@/lib/oily-fish.mjs";

const BASELINE_NOTE = "baseline seed — poids de départ";

export type BodyPoint = { metric_date: string; weight_kg: number | null; waist_cm: number | null };

/** Mesures corporelles des ~90 derniers jours + moyennes hebdo de poids. */
export async function getBodyTrends(): Promise<{
  metrics: BodyPoint[];
  weekly: WeeklyWeight[];
}> {
  const supabase = await createClient();
  const since = shiftDay(brusselsDay(), -90);
  const { data, error } = await supabase
    .from("body_metrics")
    .select("metric_date, weight_kg, waist_cm")
    .gte("metric_date", since)
    .order("metric_date");
  if (error) throw new Error(`getBodyTrends: ${error.message}`);
  const metrics = (data ?? []) as BodyPoint[];
  return { metrics, weekly: weeklyWeightAverages(metrics) };
}

/** Moyennes kcal/protéines des 7 et 30 derniers jours (jours loggés). */
export async function getMealAverages(): Promise<{ d7: PeriodAverages; d30: PeriodAverages }> {
  const supabase = await createClient();
  const today = brusselsDay();
  const since30 = shiftDay(today, -29);
  const since7 = shiftDay(today, -6);
  const { data, error } = await supabase
    .from("meal_logs")
    .select("log_date, kcal, protein_g")
    .gte("log_date", since30)
    .lte("log_date", today);
  if (error) throw new Error(`getMealAverages: ${error.message}`);
  const logs = data ?? [];
  return {
    d7: periodAverages(logs.filter((l) => l.log_date >= since7)),
    d30: periodAverages(logs),
  };
}

/** Repas au poisson gras de la semaine EN COURS (lot 8 : seule règle suivie). */
export async function getOilyFishWeek(): Promise<{ week_start: string; count: number }> {
  const supabase = await createClient();
  const today = brusselsDay();
  const monday = mondayOf(today);
  const { data, error } = await supabase
    .from("meal_logs")
    .select("log_date, recipe:recipes(tags)")
    .gte("log_date", monday)
    .lte("log_date", today)
    .not("recipe_id", "is", null);
  if (error) throw new Error(`getOilyFishWeek: ${error.message}`);
  const recipes = (data ?? []).map((l) => ({
    tags: (l.recipe as unknown as { tags: string[] | null } | null)?.tags ?? null,
  }));
  return { week_start: monday, count: oilyFishCount(recipes) };
}

export type ExerciseSeries = { id: string; name: string; points: ProgressionPoint[] };

/**
 * Progression de charge par exercice — LES baselines sont INCLUS (c'est
 * le point de départ, leur raison d'être). Seuls les exos avec ≥1 série
 * apparaissent dans le sélecteur.
 */
export async function getProgressionSeries(): Promise<ExerciseSeries[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_sets")
    .select("reps, weight_kg, exercise:exercises(id, name), workout:workouts!inner(workout_date)")
    .order("workout_date", { referencedTable: "workout" });
  if (error) throw new Error(`getProgressionSeries: ${error.message}`);

  type Row = {
    reps: number | null;
    weight_kg: number | string | null;
    exercise: { id: string; name: string } | null;
    workout: { workout_date: string } | null;
  };
  const byExercise = new Map<string, { name: string; sets: { workout_date: string; reps: number | null; weight_kg: number | string | null }[] }>();
  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.exercise || !row.workout) continue;
    const e = byExercise.get(row.exercise.id) ?? { name: row.exercise.name, sets: [] };
    e.sets.push({ workout_date: row.workout.workout_date, reps: row.reps, weight_kg: row.weight_kg });
    byExercise.set(row.exercise.id, e);
  }
  return [...byExercise.entries()]
    .map(([id, e]) => ({ id, name: e.name, points: exerciseProgression(e.sets) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Séances par semaine par type sur ~8 semaines — baselines exclus (stats). */
export async function getWeeklySessions(): Promise<WeekSessions[]> {
  const supabase = await createClient();
  const since = mondayOf(shiftDay(brusselsDay(), -7 * 7));
  const { data, error } = await supabase
    .from("workouts")
    .select("workout_date, type, notes")
    .gte("workout_date", since)
    .order("workout_date");
  if (error) throw new Error(`getWeeklySessions: ${error.message}`);
  return sessionsPerWeek((data ?? []).filter((w) => w.notes !== BASELINE_NOTE));
}
