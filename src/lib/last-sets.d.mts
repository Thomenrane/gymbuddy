export type LastSetRow = {
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | string | null;
  workout: { id: string; workout_date: string; created_at: string };
};
export type LastSets = {
  workout_date: string;
  sets: { set_number: number; reps: number | null; weight_kg: number | null }[];
};
export function latestSetsByExercise(rows: LastSetRow[]): Map<string, LastSets>;
export function summarizeSets(sets: LastSets["sets"]): string | null;
export function formatWeight(weightKg: number | string | null): string;
export function pace(distanceKm: number | null, durationMin: number | null): number | null;
export function formatPace(distanceKm: number | null, durationMin: number | null): string | null;
