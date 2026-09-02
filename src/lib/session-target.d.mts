export type SessionTargetInput = {
  defaults?: {
    sets?: number | null;
    repsMin?: number | null;
    repsMax?: number | null;
  } | null;
  targetWeight?: number | string | null;
  last?: { sets: { reps: number | null; weight_kg: number | null }[] } | null;
};
/** `weight` est toujours positif ; `assist` porte la convention du signe. */
export type SessionTarget = {
  sets: number;
  reps: number | null;
  weight: number | null;
  assist: boolean;
};
export function sessionTarget(input?: SessionTargetInput): SessionTarget;
export function formatTarget(target: SessionTarget | null | undefined): string | null;
export function targetRows(
  target: SessionTarget | null | undefined
): { reps: string; weight: string; rpe: string }[];
