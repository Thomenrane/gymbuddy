"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, X } from "@phosphor-icons/react";
import { AddExerciseSheet } from "./session-editor";
import {
  archiveTemplate,
  saveTemplate,
  type DraftTemplateExercise,
} from "@/app/(tabs)/training/training-actions";

type Row = {
  key: string;
  exerciseId?: string;
  name: string;
  sets: string;
  min: string;
  max: string;
  rpe: string;
  rest: string;
};

const cell =
  "h-11 w-full rounded-md border border-border bg-surface-raised px-2 text-center text-base outline-none focus:border-muted";

export function TemplateEditor({
  id,
  initialName,
  initialRows,
  catalog,
}: {
  id: string;
  initialName: string;
  initialRows: Row[];
  catalog: { id: string; name: string; note: string | null }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function patch(key: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function move(key: string, delta: -1 | 1) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const n = (s: string) =>
    s.trim() === "" ? null : Math.round(Number(s.replace(",", "."))) || null;

  function save() {
    setError("");
    setStatus("idle");
    startTransition(async () => {
      const exercises: DraftTemplateExercise[] = rows.map((r) => ({
        exerciseId: r.exerciseId,
        name: r.name,
        default_sets: n(r.sets),
        default_reps_min: n(r.min),
        default_reps_max: n(r.max),
        target_rpe: n(r.rpe),
        rest_seconds: n(r.rest),
      }));
      const res = await saveTemplate(id, { name, exercises });
      if ("error" in res) setError(res.error);
      else setStatus("saved");
    });
  }

  function archive() {
    startTransition(async () => {
      const res = await archiveTemplate(id);
      if ("error" in res) setError(res.error);
      else router.push("/training/templates");
    });
  }

  return (
    <main className="space-y-4">
      <Link
        href="/training/templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        Templates
      </Link>

      <input
        aria-label="Nom du template"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-12 w-full rounded-md border border-border bg-surface px-3 text-lg font-semibold outline-none focus:border-muted"
      />

      <div className="space-y-3">
        {rows.map((row, i) => (
          <section key={row.key} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="min-w-0 truncate font-semibold">{row.name}</h2>
              <div className="flex shrink-0 gap-1">
                <SmallBtn label="Monter" disabled={i === 0} onClick={() => move(row.key, -1)}>
                  <ArrowUp size={16} />
                </SmallBtn>
                <SmallBtn
                  label="Descendre"
                  disabled={i === rows.length - 1}
                  onClick={() => move(row.key, 1)}
                >
                  <ArrowDown size={16} />
                </SmallBtn>
                <SmallBtn
                  label={`Retirer ${row.name}`}
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  <X size={16} />
                </SmallBtn>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5 text-center text-xs text-faint">
              <span>séries</span>
              <span>reps min</span>
              <span>reps max</span>
              <span>RPE</span>
              <span>repos (s)</span>
            </div>
            <div className="mt-1 grid grid-cols-5 gap-1.5">
              <input aria-label="Séries" inputMode="numeric" value={row.sets} onChange={(e) => patch(row.key, { sets: e.target.value })} className={cell} />
              <input aria-label="Reps min" inputMode="numeric" value={row.min} onChange={(e) => patch(row.key, { min: e.target.value })} className={cell} />
              <input aria-label="Reps max" inputMode="numeric" value={row.max} onChange={(e) => patch(row.key, { max: e.target.value })} className={cell} />
              <input aria-label="RPE" inputMode="numeric" value={row.rpe} onChange={(e) => patch(row.key, { rpe: e.target.value })} className={cell} />
              <input aria-label="Repos" inputMode="numeric" value={row.rest} onChange={(e) => patch(row.key, { rest: e.target.value })} className={cell} />
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

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {status === "saved" && (
        <p role="status" className="text-sm text-accent">Template enregistré.</p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="h-13 w-full rounded-md bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-50"
      >
        {pending ? "Sauvegarde…" : "Enregistrer le template"}
      </button>

      {confirmArchive ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={archive}
            className="h-12 flex-1 rounded-md bg-destructive font-semibold text-white disabled:opacity-50"
          >
            Confirmer l&apos;archivage
          </button>
          <button
            type="button"
            onClick={() => setConfirmArchive(false)}
            className="h-12 flex-1 rounded-md border border-border bg-surface font-medium"
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmArchive(true)}
          className="h-12 w-full rounded-md border border-border font-medium text-destructive"
        >
          Archiver ce template
        </button>
      )}

      {addOpen && (
        <AddExerciseSheet
          catalog={catalog}
          onClose={() => setAddOpen(false)}
          onPick={(item) => {
            setRows((prev) => [
              ...prev,
              {
                key: `add-${Date.now()}`,
                exerciseId: item.id,
                name: item.name,
                sets: "3",
                min: "",
                max: "",
                rpe: "8",
                rest: "90",
              },
            ]);
            setAddOpen(false);
          }}
        />
      )}
    </main>
  );
}

function SmallBtn({
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
