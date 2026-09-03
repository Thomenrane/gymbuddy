export declare const DEFAULT_STEP_KG: number;
export declare const STREAK_REQUIRED: number;

export type ProgressionSet = {
  reps: number | null;
  weight_kg: number | null;
  rpe?: number | null;
};

export type ProgressionSession = { sets: ProgressionSet[] };

export type Suggestion = { from: number; to: number; step: number };

export declare function reachedObjective(
  sets: ProgressionSet[] | null | undefined,
  opts?: {
    repsMax?: number | null;
    signedTarget?: number | null;
    targetRpe?: number | null;
  }
): boolean;

export declare function suggestNextTarget(input?: {
  /** De la séance la PLUS RÉCENTE à la plus ancienne. */
  sessions?: ProgressionSession[] | null;
  defaults?: { repsMax?: number | null; targetRpe?: number | null } | null;
  signedTarget?: number | null;
  step?: number | null;
  declined?: number | null;
}): Suggestion | null;

export declare function formatSuggestion(s: Suggestion | null | undefined): string | null;
