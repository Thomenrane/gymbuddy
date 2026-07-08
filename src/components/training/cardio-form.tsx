"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { formatPace } from "@/lib/last-sets.mjs";
import { RUN_TYPES, type RunType, type WorkoutType } from "@/lib/training";
import { saveWorkout } from "@/app/(tabs)/training/training-actions";

const inputCls =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted";

export function CardioForm({
  mode,
  date,
  editId,
  initial,
}: {
  mode: "running" | "autre";
  date: string;
  editId: string | null;
  initial?: {
    type: WorkoutType;
    distance: string;
    duration: string;
    runType: RunType | null;
    intensity: number | null;
    notes: string;
  };
}) {
  const router = useRouter();
  const [type, setType] = useState<WorkoutType>(
    initial?.type ?? (mode === "running" ? "running" : "padel")
  );
  const [distance, setDistance] = useState(initial?.distance ?? "");
  const [duration, setDuration] = useState(initial?.duration ?? "");
  const [runType, setRunType] = useState<RunType | null>(initial?.runType ?? "normal");
  const [intensity, setIntensity] = useState<number | null>(initial?.intensity ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const pace = mode === "running" ? formatPace(n(distance), n(duration)) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await saveWorkout({
        id: editId ?? undefined,
        date,
        type,
        distance_km: mode === "running" ? n(distance) : null,
        run_type: mode === "running" ? runType : null,
        duration_min: n(duration) == null ? null : Math.round(n(duration)!),
        perceived_intensity: intensity,
        notes,
      });
      if ("error" in res) setError(res.error);
      else router.push(`/training/${res.id}`);
    });
  }

  return (
    <main className="space-y-4">
      <Link
        href={`/training/day/${date}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        {date}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        {editId ? "Modifier la séance" : mode === "running" ? "Running" : "Padel / Autre"}
      </h1>

      <form onSubmit={submit} className="space-y-4">
        {mode === "autre" && (
          <div className="flex gap-2">
            {(["padel", "autre"] as WorkoutType[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`h-11 flex-1 rounded-md border font-medium capitalize ${
                  type === t
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border bg-surface"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {mode === "running" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Distance (km)</span>
                <input
                  inputMode="decimal"
                  required
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Durée (min)</span>
                <input
                  inputMode="numeric"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            {pace && (
              <p className="text-sm text-muted">
                Pace : <span className="font-medium text-foreground">{pace}</span>
              </p>
            )}
            <div>
              <span className="mb-1 block text-sm text-muted">Type de course</span>
              <div className="flex flex-wrap gap-1.5">
                {RUN_TYPES.map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    aria-pressed={runType === rt}
                    onClick={() => setRunType(rt)}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${
                      runType === rt
                        ? "border-primary bg-primary text-on-primary"
                        : "border-border bg-surface"
                    }`}
                  >
                    {rt}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === "autre" && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Durée (min)</span>
            <input
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={inputCls}
            />
          </label>
        )}

        <div>
          <span className="mb-1 block text-sm text-muted">Intensité perçue</span>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={intensity === v}
                onClick={() => setIntensity(v)}
                className={`h-10 rounded-md border text-sm font-medium ${
                  intensity === v
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border bg-surface"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <input
          placeholder="Notes (optionnel)"
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputCls}
        />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="h-13 w-full rounded-md bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-50"
        >
          {pending ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </form>
    </main>
  );
}
