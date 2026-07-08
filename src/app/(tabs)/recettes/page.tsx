import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { getActiveRecipes } from "@/lib/recipes-server";
import { RecipesList } from "@/components/recipes/recipes-list";

export const dynamic = "force-dynamic";

export default async function RecettesPage() {
  const recipes = await getActiveRecipes();

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Recettes
        </h1>
        <span className="text-sm text-muted">{recipes.length} actives</span>
      </div>

      <RecipesList recipes={recipes} />

      <Link
        href="/recettes/new"
        aria-label="Nouvelle recette"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary transition-transform active:scale-95"
      >
        <Plus size={28} weight="bold" />
      </Link>
    </main>
  );
}
