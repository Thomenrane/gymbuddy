"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { addFoodPreference, deleteFoodPreference } from "@/app/(tabs)/today-actions";
import type { FoodPreference, FoodPrefKind } from "@/lib/food-prefs-server";

const KIND_LABEL: Record<FoodPrefKind, string> = {
  dislike: "n'aime pas",
  allergy: "allergie",
  preference: "préférence",
};
const KINDS: FoodPrefKind[] = ["dislike", "allergy", "preference"];

// Section éditable des préférences alimentaires d'UNE personne (Lot 13).
// Tags simples : ajouter (libellé libre + type) / supprimer. Aucun filtrage
// automatique de recettes — Claude en tient compte à la planification.
export function FoodPreferences({
  person,
  personLabel,
  preferences,
}: {
  person: string;
  personLabel: string;
  preferences: FoodPreference[];
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<FoodPrefKind>("dislike");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const value = label.trim();
    if (!value) return;
    setError("");
    startTransition(async () => {
      const res = await addFoodPreference({ person, kind, label: value });
      if ("error" in res) setError(res.error);
      else setLabel("");
    });
  }

  function remove(id: string) {
    setError("");
    startTransition(async () => {
      const res = await deleteFoodPreference(id);
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <h3 className="mb-2 text-sm font-medium">{personLabel}</h3>

      {preferences.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {preferences.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-raised py-1 pl-3 pr-1 text-sm"
            >
              <span>{p.label}</span>
              <span className="text-xs text-faint">{KIND_LABEL[p.kind]}</span>
              <button
                type="button"
                aria-label={`Supprimer ${p.label}`}
                disabled={pending}
                onClick={() => remove(p.id)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted active:bg-surface disabled:opacity-40"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-muted">Aucune préférence enregistrée.</p>
      )}

      <form onSubmit={add} className="flex gap-1.5">
        <select
          aria-label={`Type de préférence pour ${personLabel}`}
          value={kind}
          onChange={(e) => setKind(e.target.value as FoodPrefKind)}
          className="h-11 shrink-0 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-muted"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex. poisson blanc, thon…"
          aria-label={`Ajouter une préférence pour ${personLabel}`}
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted"
        />
        <button
          type="submit"
          disabled={pending || label.trim() === ""}
          aria-label="Ajouter"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary disabled:opacity-50"
        >
          <Plus size={18} />
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
