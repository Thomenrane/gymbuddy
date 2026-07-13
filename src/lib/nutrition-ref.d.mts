// Types du module pur garde-fou macros (référence nutritionnelle CIQUAL).

export type MacroTuple = [kcal: number, protein_g: number, carbs_g: number, fat_g: number];
export type MacroTable = Record<string, MacroTuple>;

export type Tables = {
  g: MacroTable;
  ml: MacroTable;
  piece: MacroTable;
  portion: MacroTable;
};

export type Verdict = "ok" | "warn" | "warn_high" | "review";

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type Ingredient = { item: string; qty: number; unit: string; note?: string };

export type Contribution = {
  item: string;
  qty: number;
  unit: string;
  known: boolean;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type CheckResult = {
  verdict: Verdict;
  label: string;
  claimed: Macros;
  computed: Macros;
  deltaPct: Macros;
  unknown: string[];
  contributions: Contribution[];
  tolerancePct: number;
  highPct: number;
};

export const PER_100G: MacroTable;
export const PER_PIECE: MacroTable;
export const PER_100ML: MacroTable;
export const PER_PORTION: MacroTable;
export const DEFAULT_TABLES: Tables;
export const BASIS_KEY: Record<string, keyof Tables>;
export const VERDICT_LABEL: Record<Verdict, string>;

export function tablesFromRows(
  rows?: Array<{
    item: string;
    basis: string;
    kcal: number | string;
    protein_g: number | string;
    carbs_g: number | string;
    fat_g: number | string;
  }>,
  base?: Tables
): Tables;

export function computeMacros(
  ingredients?: Ingredient[],
  tables?: Tables
): { computed: Macros; unknown: string[]; contributions: Contribution[] };

export function checkRecipe(
  recipe: { kcal: number | string; protein_g: number | string; carbs_g: number | string; fat_g: number | string; ingredients: Ingredient[] },
  opts?: { tolerancePct?: number; highPct?: number; tables?: Tables }
): CheckResult;
