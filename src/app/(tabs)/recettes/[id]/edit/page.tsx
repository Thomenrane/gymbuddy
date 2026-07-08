import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getRecipe } from "@/lib/recipes-server";
import { RecipeForm } from "@/components/recipes/recipe-form";
import { updateRecipe } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  const action = updateRecipe.bind(null, recipe.id);

  return (
    <main className="space-y-4">
      <Link
        href={`/recettes/${recipe.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        {recipe.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        Modifier
      </h1>
      <RecipeForm
        initial={recipe}
        action={action}
        submitLabel="Enregistrer"
        cancelHref={`/recettes/${recipe.id}`}
      />
    </main>
  );
}
