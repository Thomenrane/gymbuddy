"use client";

import { useState, useTransition } from "react";
import { Scales, CaretRight } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { upsertBodyMetric } from "@/app/(tabs)/today-actions";
import type { BodyMetric } from "@/lib/today";

const inputCls =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-muted";

export function WeightWidget({
  date,
  metric,
}: {
  date: string;
  metric: BodyMetric | null;
}) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState(metric?.weight_kg ? String(metric.weight_kg) : "");
  const [waist, setWaist] = useState(metric?.waist_cm ? String(metric.waist_cm) : "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await upsertBodyMetric({
        date,
        weight_kg: n(weight),
        waist_cm: n(waist),
      });
      if ("error" in res) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        data-testid="weight-widget"
        onClick={() => setOpen(true)}
        aria-label="Peser — enregistrer le poids du jour"
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left active:bg-surface-raised"
      >
        <span className="flex items-center gap-2.5 text-sm">
          <Scales size={18} className="text-muted" aria-hidden />
          {metric?.weight_kg != null ? (
            <span>
              <span className="font-medium">{metric.weight_kg} kg</span>
              {metric.waist_cm != null && (
                <span className="text-muted"> · taille {metric.waist_cm} cm</span>
              )}
            </span>
          ) : (
            <span className="text-muted">Se peser aujourd&apos;hui</span>
          )}
        </span>
        <CaretRight size={16} className="text-faint" aria-hidden />
      </button>

      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Pesée">
          <form onSubmit={save} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Poids (kg)</span>
              <input
                inputMode="decimal"
                autoFocus
                placeholder="82,0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Tour de taille (cm) — optionnel</span>
              <input
                inputMode="decimal"
                placeholder="88"
                value={waist}
                onChange={(e) => setWaist(e.target.value)}
                className={inputCls}
              />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
            >
              {pending ? "Sauvegarde…" : "Enregistrer"}
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}
