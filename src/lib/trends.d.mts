export type WeeklyWeight = {
  week_start: string;
  avg_weight_kg: number;
  measurements: number;
};

export type ProgressionPoint = {
  date: string;
  max_weight_kg: number | null;
  volume: number;
};

export type PeriodAverages = {
  days_logged: number;
  kcal_avg: number | null;
  protein_avg: number | null;
};

export type WeekSessions = {
  week_start: string;
  counts: Record<string, number>;
  total: number;
};

export function weeklyWeightAverages(
  metrics: { metric_date: string; weight_kg: number | string | null }[]
): WeeklyWeight[];

export function exerciseProgression(
  sets: { workout_date: string; reps: number | null; weight_kg: number | string | null }[]
): ProgressionPoint[];

export function periodAverages(
  logs: { log_date: string; kcal: number; protein_g: number | string }[]
): PeriodAverages;

export function sessionsPerWeek(
  workouts: { workout_date: string; type: string }[]
): WeekSessions[];
