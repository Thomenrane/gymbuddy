import Link from "next/link";
import { Clock } from "@phosphor-icons/react/dist/ssr";
import type { Recipe } from "@/lib/recipes";
import { MacroBar, MacroValues } from "./macro-bar";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      href={`/recettes/${recipe.id}`}
      className="block rounded-lg border border-border bg-surface p-4 transition-transform active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{recipe.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            {recipe.prep_min != null && (
              <>
                <Clock size={14} aria-hidden />
                {recipe.prep_min} min
              </>
            )}
            {recipe.code && (
              <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs font-medium">
                {recipe.code}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-2xl font-semibold leading-none">
            {recipe.kcal}
          </span>
          <span className="block text-xs text-muted">kcal</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <MacroBar
          protein={recipe.protein_g}
          carbs={recipe.carbs_g}
          fat={recipe.fat_g}
        />
        <MacroValues
          protein={recipe.protein_g}
          carbs={recipe.carbs_g}
          fat={recipe.fat_g}
        />
      </div>
    </Link>
  );
}
