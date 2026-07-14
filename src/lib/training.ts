// Types et constantes isomorphes de l'onglet Training.
export type WorkoutType = "muscu" | "running" | "padel" | "autre";

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  muscu: "Muscu",
  running: "Running",
  padel: "Padel",
  autre: "Autre",
};

export const RUN_TYPES = [
  "normal",
  "intervalles",
  "fractionné",
  "long",
  "récup",
] as const;
export type RunType = (typeof RUN_TYPES)[number];

export type Exercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  measure_type: "reps" | "duration" | "distance";
  note: string | null;
  // Lot 14 : prochain poids à viser, posé par Claude via MCP. Null = pas de cible.
  target_weight_kg: number | null;
  target_weight_note: string | null;
};

export type WorkoutSet = {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_s: number | null;
  distance_m: number | null;
  rpe: number | null; // effort perçu ressenti 1-10 (demi-points), null si absent
  exercise?: { name: string } | null;
};

export type Workout = {
  id: string;
  workout_date: string;
  type: WorkoutType;
  template_id: string | null;
  duration_min: number | null;
  distance_km: number | null;
  run_type: RunType | null;
  perceived_intensity: number | null;
  notes: string | null;
  created_at: string;
  workout_sets?: WorkoutSet[];
  // Lot 18 : notes par exercice (contexte qualitatif, distinct de `notes`).
  exercise_notes?: { exercise_id: string; note: string }[];
};

export type TemplateExercise = {
  id: string;
  template_id: string;
  exercise_id: string;
  position: number;
  default_sets: number | null;
  default_reps_min: number | null;
  default_reps_max: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  exercise: Exercise;
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  type: WorkoutType;
  is_active: boolean;
  template_exercises?: TemplateExercise[];
};

// Hint AMENDEMENT 5, affiché sur l'écran séance (aucune logique automatique)
export const PROGRESSION_HINT =
  "Double progression : atteins le haut de la fourchette de reps sur toutes les séries avant d'ajouter du poids (+2,5 kg barre / −2 à −3 kg d'assistance), puis repars au bas de la fourchette.";
