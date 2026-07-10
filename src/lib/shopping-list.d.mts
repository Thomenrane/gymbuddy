export type ShoppingEntry = {
  portion_factor: number | string;
  for_two?: boolean;
  total_portion?: number | string;
  recipe: { ingredients: { item: string; qty: number; unit: string }[] } | null;
};
export type ShoppingItem = { item: string; qty: number; unit: string; rayon: string };
export function rayonOf(item: string): string;
export function aggregateShoppingList(entries: ShoppingEntry[]): ShoppingItem[];
export function shoppingListAsText(items: ShoppingItem[]): string;
export function shoppingListForListonic(items: ShoppingItem[]): string;
