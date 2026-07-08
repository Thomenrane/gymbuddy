"use client";

import { useState, useTransition } from "react";
import { updateTargets } from "@/app/(tabs)/today-actions";
import type { Targets } from "@/lib/today";

const inputCls =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-muted";

export function TargetsForm({ targets }: { targets: Targets }) {
  const [kcal, setKcal] = useState(String(targets.kcal));
  const [p, setP] = useState(String(targets.protein_g));
  const [g, setG] = useState(String(targets.carbs_g));
  const [l, setL] = useState(String(targets.fat_g));
  const [fiber, setFiber] = useState(String(targets.fiber_g));
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const n = (s: string) => Number(s.replace(",", "."));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    startTransition(async () => {
      const res = await updateTargets({
        kcal: n(kcal),
        protein_g: n(p),
        carbs_g: n(g),
        fat_g: n(l),
        fiber_g: n(fiber),
      });
      if ("error" in res) {
        setError(res.error);
        setStatus("error");
      } else {
        setStatus("saved");
      }
    });
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Calories (kcal / jour)</span>
        <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Protéines (g)</span>
          <input inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Glucides (g)</span>
          <input inputMode="numeric" value={g} onChange={(e) => setG(e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Lipides (g)</span>
          <input inputMode="numeric" value={l} onChange={(e) => setL(e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Fibres (g, objectif)</span>
          <input inputMode="numeric" value={fiber} onChange={(e) => setFiber(e.target.value)} className={inputCls} />
        </label>
      </div>
      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}
      {status === "saved" && (
        <p role="status" className="text-sm text-accent">Cibles enregistrées.</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
      >
        {pending ? "Sauvegarde…" : "Enregistrer les cibles"}
      </button>
    </form>
  );
}
