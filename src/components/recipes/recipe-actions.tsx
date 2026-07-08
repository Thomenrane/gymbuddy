"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, PencilSimple, Archive } from "@phosphor-icons/react";
import { archiveRecipe, duplicateRecipe } from "@/app/(tabs)/recettes/actions";

export function RecipeActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => duplicateRecipe(id))}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-on-primary transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <Copy size={20} aria-hidden />
          Dupliquer
        </button>
        <Link
          href={`/recettes/${id}/edit`}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface font-semibold transition-transform active:scale-[0.98]"
        >
          <PencilSimple size={20} aria-hidden />
          Modifier
        </Link>
      </div>

      {confirmArchive ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => archiveRecipe(id))}
            className="h-12 flex-1 rounded-xl bg-destructive font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            Confirmer l&apos;archivage
          </button>
          <button
            type="button"
            onClick={() => setConfirmArchive(false)}
            className="h-12 flex-1 rounded-xl border border-border bg-surface font-semibold"
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmArchive(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border font-medium text-destructive transition-colors active:bg-surface"
        >
          <Archive size={20} aria-hidden />
          Archiver
        </button>
      )}
    </div>
  );
}
