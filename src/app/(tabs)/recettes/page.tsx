import Link from "next/link";
import { ListBullets, Plus } from "@phosphor-icons/react/dist/ssr";
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

      {/* Lot 28 : le scan a déménagé sur l'accueil (PO). Ce lien reste, mais il
          ne se présente plus comme un scanner : ce qu'on vient y faire, c'est
          gérer la référence ingrédients — la page /recettes/ingredients n'a pas
          d'autre porte d'entrée. */}
      <Link
        href="/recettes/ingredients"
        className="flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium"
      >
        <ListBullets size={18} className="text-muted" aria-hidden />
        Référence ingrédients
      </Link>

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
