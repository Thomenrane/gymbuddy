// Types du module pur mode couple (Lot 11).

export type Macros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type RecipeMacros = {
  kcal: number;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
};

export function assertCoupleShare(
  forTwo: boolean,
  poShare: number | string | null | undefined
): number;

export function poLogMacros(
  recipe: RecipeMacros,
  portionFactor: number,
  forTwo: boolean,
  poShare: number | string | null | undefined
): Macros;

export function sarahShareFromLog(log: {
  for_two?: boolean;
  po_share?: number | string;
  kcal: number;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
}): Macros | null;

export function sarahDayTotals(
  logs?: Array<{
    for_two?: boolean;
    po_share?: number | string;
    kcal: number;
    protein_g: number | string;
    carbs_g: number | string;
    fat_g: number | string;
  }>
): Macros | null;

export function planEntryMacros(entry: {
  for_two?: boolean;
  po_share?: number | string;
  portion_factor?: number | string;
  total_portion?: number | string;
  recipe: RecipeMacros | null;
}): { po: Macros; sarah: Macros | null };

export function shoppingFactor(entry: {
  for_two?: boolean;
  portion_factor?: number | string;
  total_portion?: number | string;
}): number;

export function pctOfTargets(
  totals: Macros,
  targets: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
): { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
