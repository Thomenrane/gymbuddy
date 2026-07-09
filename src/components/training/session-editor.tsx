"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CaretDown,
  CaretUp,
  Plus,
  X,
} from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { saveWorkout, type DraftExercise } from "@/app/(tabs)/training/training-actions";
import { PROGRESSION_HINT } from "@/lib/training";

export type EditorExercise = {
  key: string;
  exerciseId?: string;
  name: string;
  note?: string | null;
  repRange?: string | null;
  rpe?: number | null;
  rest?: number | null;
  refSummary?: string | null;
  refDate?: string | null;
  assist: boolean; // poids saisis en assistance (stockés négatifs)
  sets: { reps: string; weight: string }[];
};

type CatalogItem = { id: string; name: string; note: string | null };

const inputCls =
  "h-11 w-full rounded-md border border-border bg-surface-raised px-2.5 text-center text-base outline-none focus:border-muted";

export function SessionEditor({
  title,
  date,
  templateId,
  editId,
  initialExercises,
  catalog,
  initialMeta,
}: {
  title: string;
  date: string;
  templateId: string | null;
  editId: string | null;
  initialExercises: EditorExercise[];
  catalog: CatalogItem[];
  initialMeta?: { duration: string; intensity: number | null; notes: string };
}) {
  const router = useRouter();
  const draftKey = `gb-session-${editId ?? templateId ?? "vierge"}-${date}`;
  const [exercises, setExercises] = useState(initialExercises);
  const [restored, setRestored] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const startedAt = useRef(Date.now());

  // Persistance locale : une séance en cours ne doit JAMAIS être perdue.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (Array.isArray(draft.exercises) && draft.exercises.length > 0) {
          setExercises(draft.exercises);
          startedAt.current = draft.startedAt ?? Date.now();
          setRestored(true);
        }
      }
    } catch {
      /* draft illisible : on repart du pré-rempli */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ exercises, startedAt: startedAt.current })
      );
    } catch {
      /* stockage plein : tant pis, l'état React reste */
    }
  }, [exercises, draftKey]);

  function resetDraft() {
    localStorage.removeItem(draftKey);
    setExercises(initialExercises);
    setRestored(false);
  }

  function patchExercise(key: string, patch: Partial<EditorExercise>) {
    setExercises((prev) =>
      prev.map((ex) => (ex.key === key ? { ...ex, ...patch } : ex))
    );
  }

  function move(key: string, delta: -1 | 1) {
    setExercises((prev) => {
      const i = prev.findIndex((e) => e.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/training/day/${date}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted"
        >
          <ArrowLeft size={16} aria-hidden />
          {date}
        </Link>
        {restored && (
          <button
            type="button"
            onClick={resetDraft}
            className="text-sm text-muted underline underline-offset-2"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {restored && (
        <p className="text-sm text-accent">Séance en cours restaurée.</p>
      )}

      <button
        type="button"
        onClick={() => setShowHint((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-left text-xs text-muted"
      >
        <span>Rappel : double progression</span>
        {showHint ? <CaretUp size={14} /> : <CaretDown size={14} />}
      </button>
      {showHint && <p className="px-1 text-xs leading-relaxed text-muted">{PROGRESSION_HINT}</p>}

      <div className="space-y-4">
        {exercises.map((ex, exIndex) => (
          <section key={ex.key} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold leading-tight">{ex.name}</h2>
                {ex.note && <p className="text-xs text-faint">{ex.note}</p>}
                {ex.refSummary && (
                  <p className="mt-0.5 text-xs text-muted">
                    Dernière fois : <span className="text-foreground">{ex.refSummary}</span>
                    {ex.refDate && <span className="text-faint"> · {ex.refDate}</span>}
                  </p>
                )}
                {(ex.repRange || ex.rpe || ex.rest) && (
                  <p className="text-xs text-faint">
                    Cible :{" "}
                    {[
                      ex.repRange && `${ex.repRange} reps`,
                      ex.rpe && `RPE ${ex.rpe}`,
                      ex.rest && `repos ${ex.rest}s`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <IconBtn label="Monter" disabled={exIndex === 0} onClick={() => move(ex.key, -1)}>
                  <ArrowUp size={16} />
                </IconBtn>
                <IconBtn
                  label="Descendre"
                  disabled={exIndex === exercises.length - 1}
                  onClick={() => move(ex.key, 1)}
                >
                  <ArrowDown size={16} />
                </IconBtn>
                <IconBtn
                  label={`Retirer ${ex.name}`}
                  onClick={() =>
                    setExercises((prev) => prev.filter((e) => e.key !== ex.key))
                  }
                >
                  <X size={16} />
                </IconBtn>
              </div>
            </div>

            <div className="mt-2 space-y-1.5">
              <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-1.5 text-xs text-faint">
                <span />
                <span className="text-center">reps</span>
                <span className="text-center">
                  {ex.assist ? "assistance (kg)" : "poids (kg)"}
                </span>
                <span />
              </div>
              {ex.sets.map((set, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-1.5"
                >
                  <span className="text-center text-sm text-muted">{i + 1}</span>
                  <input
                    aria-label={`${ex.name} série ${i + 1} reps`}
                    inputMode="numeric"
                    value={set.reps}
                    onChange={(e) =>
                      patchExercise(ex.key, {
                        sets: ex.sets.map((s, j) =>
                          j === i ? { ...s, reps: e.target.value } : s
                        ),
                      })
                    }
                    className={inputCls}
                  />
                  <input
                    aria-label={`${ex.name} série ${i + 1} poids`}
                    inputMode="decimal"
                    placeholder="PDC"
                    value={set.weight}
                    onChange={(e) =>
                      patchExercise(ex.key, {
                        sets: ex.sets.map((s, j) =>
                          j === i ? { ...s, weight: e.target.value } : s
                        ),
                      })
                    }
                    className={inputCls}
                  />
                  <IconBtn
                    label={`Supprimer la série ${i + 1}`}
                    onClick={() =>
                      patchExercise(ex.key, {
                        sets: ex.sets.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <X size={16} />
                  </IconBtn>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  patchExercise(ex.key, {
                    sets: [...ex.sets, ex.sets.at(-1) ?? { reps: "", weight: "" }],
                  })
                }
                className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-border text-sm text-muted active:bg-surface-raised"
              >
                <Plus size={14} /> Série
              </button>
              <button
                type="button"
                aria-pressed={ex.assist}
                onClick={() => patchExercise(ex.key, { assist: !ex.assist })}
                className={`h-9 rounded-md border px-3 text-sm font-medium ${
                  ex.assist
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border text-muted"
                }`}
              >
                assistance
              </button>
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border font-medium text-muted active:bg-surface"
      >
        <Plus size={18} /> Ajouter un exercice
      </button>

      <button
        type="button"
        onClick={() => setFinishOpen(true)}
        disabled={exercises.length === 0}
        className="h-13 w-full rounded-md bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-50"
      >
        Terminer la séance
      </button>

      {addOpen && (
        <AddExerciseSheet
          catalog={catalog}
          onClose={() => setAddOpen(false)}
          onPick={(item) => {
            setExercises((prev) => [
              ...prev,
              {
                key: `add-${Date.now()}`,
                exerciseId: item.id,
                name: item.name,
                note: item.note,
                assist: false,
                sets: [
                  { reps: "", weight: "" },
                  { reps: "", weight: "" },
                  { reps: "", weight: "" },
                ],
              },
            ]);
            setAddOpen(false);
          }}
        />
      )}

      {finishOpen && (
        <FinishSheet
          onClose={() => setFinishOpen(false)}
          initialMeta={initialMeta}
          startedAt={startedAt.current}
          isEdit={Boolean(editId)}
          onSave={async (meta) => {
            const payload: DraftExercise[] = exercises.map((ex) => ({
              exerciseId: ex.exerciseId,
              name: ex.name,
              sets: ex.sets.map((s) => {
                const reps = s.reps.trim() === "" ? null : Math.round(Number(s.reps.replace(",", "."))) || null;
                const raw = s.weight.trim() === "" ? null : Number(s.weight.replace(",", "."));
                const weight =
                  raw == null || Number.isNaN(raw)
                    ? null
                    : ex.assist
                      ? -Math.abs(raw)
                      : raw;
                return { reps, weight_kg: weight };
              }),
            }));
            const res = await saveWorkout({
              id: editId ?? undefined,
              date,
              type: "muscu",
              templateId,
              duration_min: meta.duration,
              perceived_intensity: meta.intensity,
              notes: meta.notes,
              exercises: payload,
            });
            if ("error" in res) return res.error;
            localStorage.removeItem(draftKey);
            router.push(`/training/${res.id}`);
            return null;
          }}
        />
      )}
    </main>
  );
}

function IconBtn({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted active:bg-surface-raised disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function AddExerciseSheet({
  catalog,
  onClose,
  onPick,
}: {
  catalog: CatalogItem[];
  onClose: () => void;
  onPick: (item: { id?: string; name: string; note: string | null }) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? catalog.filter((c) => c.name.toLowerCase().includes(q))
      : catalog;
  }, [catalog, query]);
  const exactMatch = catalog.some(
    (c) => c.name.toLowerCase() === query.trim().toLowerCase()
  );

  return (
    <Sheet open onClose={onClose} title="Ajouter un exercice">
      <div className="space-y-3">
        <input
          autoFocus
          placeholder="Rechercher ou créer…"
          aria-label="Rechercher un exercice"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted"
        />
        <ul className="divide-y divide-border rounded-md border border-border">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-baseline justify-between px-3 py-3 text-left active:bg-surface"
              >
                <span>{c.name}</span>
                {c.note && (
                  <span className="ml-2 shrink-0 text-xs text-faint">{c.note}</span>
                )}
              </button>
            </li>
          ))}
          {query.trim() && !exactMatch && (
            <li>
              <button
                type="button"
                onClick={() => onPick({ name: query.trim(), note: null })}
                className="flex w-full items-center gap-1.5 px-3 py-3 text-left font-medium active:bg-surface"
              >
                <Plus size={16} aria-hidden />
                Créer «{query.trim()}»
              </button>
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}

function FinishSheet({
  onClose,
  onSave,
  startedAt,
  isEdit,
  initialMeta,
}: {
  onClose: () => void;
  onSave: (meta: {
    duration: number | null;
    intensity: number | null;
    notes: string;
  }) => Promise<string | null>;
  startedAt: number;
  isEdit: boolean;
  initialMeta?: { duration: string; intensity: number | null; notes: string };
}) {
  const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
  const [duration, setDuration] = useState(
    initialMeta?.duration ?? (isEdit ? "" : String(elapsed))
  );
  const [intensity, setIntensity] = useState<number | null>(
    initialMeta?.intensity ?? null
  );
  const [notes, setNotes] = useState(initialMeta?.notes ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Sheet open onClose={onClose} title={isEdit ? "Enregistrer les modifications" : "Terminer la séance"}>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Durée (min)</span>
          <input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-muted"
          />
        </label>
        <div>
          <span className="mb-1 block text-sm text-muted">Intensité perçue</span>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={intensity === n}
                onClick={() => setIntensity(n)}
                className={`h-10 rounded-md border text-sm font-medium ${
                  intensity === n
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border bg-surface"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <input
          placeholder="Notes (optionnel)"
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted"
        />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError("");
              const err = await onSave({
                duration: duration.trim() === "" ? null : Math.round(Number(duration)) || null,
                intensity,
                notes,
              });
              if (err) setError(err);
            })
          }
          className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
        >
          {pending ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </div>
    </Sheet>
  );
}
