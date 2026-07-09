"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { createTemplate } from "@/app/(tabs)/training/training-actions";

export function NewTemplateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border font-medium text-muted active:bg-surface"
      >
        <Plus size={18} aria-hidden />
        Nouveau template
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
          const res = await createTemplate(name);
          if ("error" in res) setError(res.error);
          else router.push(`/training/templates/${res.id}`);
        });
      }}
      className="space-y-2"
    >
      <input
        autoFocus
        required
        placeholder="Full Body D, Push, Pull…"
        aria-label="Nom du nouveau template"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted"
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-12 flex-1 rounded-md border border-border bg-surface font-medium"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-12 flex-[2] rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
        >
          {pending ? "Création…" : "Créer"}
        </button>
      </div>
    </form>
  );
}
