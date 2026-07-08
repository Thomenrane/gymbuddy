import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { RecipeForm } from "@/components/recipes/recipe-form";
import { createRecipe } from "../actions";

export default function NewRecipePage() {
  return (
    <main className="space-y-4">
      <Link
        href="/recettes"
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        Recettes
      </Link>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">
        Nouvelle recette
      </h1>
      <RecipeForm
        action={createRecipe}
        submitLabel="Créer la recette"
        cancelHref="/recettes"
      />
    </main>
  );
}
