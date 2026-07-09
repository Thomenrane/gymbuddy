export type AlanRule = {
  tag: string;
  label: string;
  min?: number;
  max?: number;
};

export type AlanCount = {
  tag: string;
  label: string;
  count: number;
  min?: number;
  max?: number;
  ok: boolean;
};

export const ALAN_RULES: readonly AlanRule[];

export function alanCounts(recipes: { tags: string[] | null }[]): AlanCount[];
