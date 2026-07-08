"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Recipe,
  type RecipeCategory,
} from "@/lib/recipes";
import { RecipeCard } from "./recipe-card";

export function RecipesList({ recipes }: { recipes: Recipe[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<RecipeCategory | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes)
      for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (category && r.category !== category) return false;
      if (activeTags.length && !activeTags.every((t) => r.tags?.includes(t)))
        return false;
      if (q) {
        const haystack = `${r.name} ${r.code ?? ""} ${(r.tags ?? []).join(" ")} ${r.ingredients.map((i) => i.item).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [recipes, query, category, activeTags]);

  const grouped = useMemo(() => {
    if (category) return null;
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: filtered.filter((r) => r.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [filtered, category]);

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  return (
    <div className="space-y-4">
      <label className="flex h-12 items-center gap-2 rounded-md border border-border bg-surface px-3 focus-within:border-muted">
        <MagnifyingGlass size={20} className="shrink-0 text-muted" aria-hidden />
        <input
          type="search"
          placeholder="Recette, ingrédient, tag…"
          aria-label="Rechercher une recette"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-base outline-none placeholder:text-muted"
        />
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <FilterChip
          label="Toutes"
          active={category === null}
          onClick={() => setCategory(null)}
        />
        {CATEGORY_ORDER.map((cat) => (
          <FilterChip
            key={cat}
            label={CATEGORY_LABELS[cat]}
            active={category === cat}
            onClick={() => setCategory(category === cat ? null : cat)}
          />
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {allTags.map((tag) => (
            <FilterChip
              key={tag}
              label={tag}
              small
              active={activeTags.includes(tag)}
              onClick={() => toggleTag(tag)}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted">
          Aucune recette ne correspond. Modifie la recherche ou les filtres.
        </p>
      ) : grouped ? (
        grouped.map(({ cat, items }) => (
          <section key={cat} className="space-y-2">
            <h2 className="pt-2 text-sm font-medium text-muted">
              {CATEGORY_LABELS[cat]}
              <span className="ml-2 text-sm font-normal">{items.length}</span>
            </h2>
            {items.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </section>
        ))
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  small = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-md border font-medium transition-colors ${
        small ? "px-3 py-1.5 text-sm" : "px-4 py-2"
      } ${
        active
          ? "border-primary bg-primary text-on-primary"
          : "border-border bg-surface text-foreground active:bg-surface-raised"
      }`}
    >
      {label}
    </button>
  );
}
