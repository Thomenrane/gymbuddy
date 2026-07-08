import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "@phosphor-icons/react/dist/ssr";
import { getRecipe } from "@/lib/recipes-server";
import { CATEGORY_LABELS } from "@/lib/recipes";
import { MacroBar } from "@/components/recipes/macro-bar";
import { RecipeActions } from "@/components/recipes/recipe-actions";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  return (
    <main className="space-y-5">
      <Link
        href="/recettes"
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        Recettes
      </Link>

      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">
          {recipe.name}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
          <Badge>{CATEGORY_LABELS[recipe.category]}</Badge>
          {recipe.code && <Badge>{recipe.code}</Badge>}
          <Badge>
            source : {recipe.source === "plan" ? "plan" : recipe.source}
          </Badge>
          {!recipe.is_active && (
            <Badge className="border-destructive text-destructive">
              archivée
            </Badge>
          )}
          {(recipe.tags ?? []).map((t) => (
            <Badge key={t} className="text-muted">
              #{t}
            </Badge>
          ))}
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-end justify-between">
          <div>
            <span className="font-display text-4xl font-bold leading-none">
              {recipe.kcal}
            </span>
            <span className="ml-1 text-sm text-muted">kcal</span>
          </div>
          {recipe.prep_min != null && (
            <span className="flex items-center gap-1 text-sm text-muted">
              <Clock size={16} aria-hidden />
              {recipe.prep_min} min
            </span>
          )}
        </div>
        <div className="mt-3">
          <MacroBar
            protein={recipe.protein_g}
            carbs={recipe.carbs_g}
            fat={recipe.fat_g}
          />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <MacroTile label="Protéines" value={recipe.protein_g} color="text-macro-p" />
          <MacroTile label="Glucides" value={recipe.carbs_g} color="text-macro-g" />
          <MacroTile label="Lipides" value={recipe.fat_g} color="text-macro-l" />
        </dl>
        {recipe.fiber_g != null && (
          <p className="mt-2 text-center text-xs text-muted">
            + {recipe.fiber_g} g de fibres
          </p>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-muted">
          Ingrédients
        </h2>
        <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-surface">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex items-baseline gap-3 px-4 py-3">
              <span className="font-display min-w-14 text-right font-semibold">
                {ing.qty}
                <span className="ml-0.5 text-xs font-normal text-muted">
                  {ing.unit}
                </span>
              </span>
              <span className="flex-1">
                {ing.item}
                {ing.note && (
                  <span className="block text-sm text-muted">{ing.note}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {(recipe.steps ?? []).length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-muted">
            Préparation
          </h2>
          <ol className="mt-2 space-y-2">
            {recipe.steps!.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-display mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-semibold">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <RecipeActions id={recipe.id} />
    </main>
  );
}

function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-border bg-surface px-2.5 py-1 ${className}`}
    >
      {children}
    </span>
  );
}

function MacroTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-surface-raised px-2 py-3">
      <dd className={`font-display text-xl font-bold ${color}`}>
        {Number.isInteger(Number(value)) ? value : Number(value).toFixed(1)}
        <span className="text-xs font-normal"> g</span>
      </dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
    </div>
  );
}
