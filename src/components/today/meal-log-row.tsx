"use client";

import { useMemo, useState, useTransition } from "react";
import { NotePencil } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { deleteMealLog, updateMealLog } from "@/app/(tabs)/today-actions";
import {
  PORTION_FACTORS,
  SLOT_LABELS,
  SLOT_ORDER,
  roundMacro,
  type MealLog,
  type Slot,
} from "@/lib/today";

const inputCls =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-muted";

export function MealLogRow({ log }: { log: MealLog }) {
  const [open, setOpen] = useState(false);
  const name = log.recipe?.name ?? log.free_label ?? "—";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left active:bg-surface-raised"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {name}
            {Number(log.portion_factor) !== 1 && (
              <span className="ml-1.5 text-muted">×{Number(log.portion_factor)}</span>
            )}
          </span>
          {(log.notes || !log.recipe_id) && (
            <span className="block truncate text-xs text-muted">
              {[
                !log.recipe_id ? "log libre" : null,
                log.is_estimate ? "estimé" : null,
                log.notes,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
          <span>
            <span className="font-medium text-foreground">{log.kcal}</span> kcal ·{" "}
            <span className="text-macro-p">{Math.round(Number(log.protein_g))} P</span>
          </span>
          <NotePencil size={16} aria-hidden className="text-faint" />
        </span>
      </button>
      {open && <EditLogSheet log={log} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditLogSheet({ log, onClose }: { log: MealLog; onClose: () => void }) {
  // Base par unité de portion, dérivée des macros FIGÉES du log —
  // jamais recalculée depuis la recette actuelle (règle PRD).
  const perUnit = useMemo(() => {
    const f = Number(log.portion_factor) || 1;
    return {
      kcal: log.kcal / f,
      p: Number(log.protein_g) / f,
      g: Number(log.carbs_g) / f,
      l: Number(log.fat_g) / f,
    };
  }, [log]);

  const [slot, setSlot] = useState<Slot>(log.slot);
  const [factor, setFactor] = useState(Number(log.portion_factor));
  const [kcal, setKcal] = useState(String(log.kcal));
  const [p, setP] = useState(String(log.protein_g));
  const [g, setG] = useState(String(log.carbs_g));
  const [l, setL] = useState(String(log.fat_g));
  const [notes, setNotes] = useState(log.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const n = (s: string) => Number(String(s).replace(",", ".")) || 0;

  function applyFactor(f: number) {
    setFactor(f);
    setKcal(String(Math.round(perUnit.kcal * f)));
    setP(String(roundMacro(perUnit.p * f)));
    setG(String(roundMacro(perUnit.g * f)));
    setL(String(roundMacro(perUnit.l * f)));
  }

  function save() {
    setError("");
    startTransition(async () => {
      const res = await updateMealLog(log.id, {
        slot,
        portion_factor: factor,
        kcal: n(kcal),
        protein_g: n(p),
        carbs_g: n(g),
        fat_g: n(l),
        notes,
      });
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteMealLog(log.id);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={log.recipe?.name ?? log.free_label ?? "Log"}>
      <div className="space-y-3">
        <div>
          <span className="mb-1 block text-sm text-muted">Slot</span>
          <div className="flex flex-wrap gap-1.5">
            {SLOT_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={slot === s}
                onClick={() => setSlot(s)}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  slot === s
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border bg-surface"
                }`}
              >
                {SLOT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {log.recipe_id && (
          <div>
            <span className="mb-1 block text-sm text-muted">
              Portion (recalcule les macros depuis ce log)
            </span>
            <div className="flex gap-1.5">
              {PORTION_FACTORS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={factor === f}
                  onClick={() => applyFactor(f)}
                  className={`h-10 flex-1 rounded-md border text-sm font-medium ${
                    factor === f
                      ? "border-primary bg-primary text-on-primary"
                      : "border-border bg-surface"
                  }`}
                >
                  ×{f}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">kcal</span>
            <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Protéines (g)</span>
            <input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Glucides (g)</span>
            <input inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Lipides (g)</span>
            <input inputMode="decimal" value={l} onChange={(e) => setL(e.target.value)} className={inputCls} />
          </label>
        </div>

        <input
          placeholder="Notes (pas de maïs, remplacé par edamame…)"
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputCls}
        />

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          {confirmDelete ? (
            <>
              <button type="button" disabled={pending} onClick={remove} className="h-12 flex-1 rounded-md bg-destructive font-semibold text-white disabled:opacity-50">
                Confirmer la suppression
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-12 flex-1 rounded-md border border-border bg-surface font-medium">
                Annuler
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setConfirmDelete(true)} className="h-12 flex-1 rounded-md border border-border font-medium text-destructive">
                Supprimer
              </button>
              <button type="button" disabled={pending} onClick={save} className="h-12 flex-[2] rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50">
                {pending ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
