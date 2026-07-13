import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getNutritionRefRows } from "@/lib/recipes-server";
import { IngredientRefs } from "@/components/recipes/ingredient-refs";

export const dynamic = "force-dynamic";

// Lot 17 : la référence nutritionnelle devient visible — produits scannés en
// tête (c'est ce que le PO mange vraiment), seed CIQUAL replié. Scan direct
// depuis ici, sans passer par le log d'un repas.
export default async function IngredientsPage() {
  const rows = await getNutritionRefRows();

  return (
    <main className="space-y-4">
      <Link
        href="/recettes"
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        Recettes
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Ingrédients</h1>

      <IngredientRefs rows={rows} />
    </main>
  );
}
