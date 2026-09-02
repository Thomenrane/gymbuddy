export const DRAFTS_KEY: string;
export const DRAFT_TTL_MS: number;

export type DraftSetRow = {
  reps: string;
  weight: string;
  rpe: string;
  touched?: boolean;
};
export type DraftExerciseRow = { key?: string; sets?: DraftSetRow[] };
export type StoredDraft = {
  key: string;
  title: string;
  date: string;
  templateId: string | null;
  editId: string | null;
  startedAt: number;
  updatedAt: number;
  exercises: DraftExerciseRow[];
};

export function draftKeyOf(input: {
  editId?: string | null;
  templateId?: string | null;
  date: string;
}): string;
export function draftProgress(
  exercises: DraftExerciseRow[] | null | undefined
): { done: number; total: number };
export function isResumable(draft: { exercises?: DraftExerciseRow[] } | null | undefined): boolean;
export function purgeStale<T extends Record<string, { updatedAt?: number }>>(
  index: T | null | undefined,
  now: number,
  ttl?: number
): T;
export function sortedDrafts<T extends { updatedAt?: number }>(
  index: Record<string, T> | null | undefined
): T[];
export function nextAddSeq(exercises: DraftExerciseRow[] | null | undefined): number;
export function resumeHref(draft: {
  editId?: string | null;
  templateId?: string | null;
  date: string;
}): string;
