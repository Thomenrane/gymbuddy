"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { ArrowSquareOut, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import {
  deletePlanEntry,
  planMeal,
  updatePlanEntry,
} from "@/app/(tabs)/plan/plan-actions";
import {
  PORTION_FACTORS,
  SLOT_LABELS,
  MEAL_SLOTS,
  recipeHref,
  type Slot,
} from "@/lib/today";
import { withinTolerance, type PlanEntry } from "@/lib/plan";
import { planEntryMacros } from "@/lib/couple.mjs";
import type { Targets } from "@/lib/today";

export type PlanCouple = { name: string } | null;

export type PlanPickerItem = {
  id: string;
  name: string;
  category: string;
  kcal: number;
  protein_g: number;
};

type PickTarget = { date: string; slot: Slot };
const Ctx = createContext<{
  openPicker: (t: PickTarget) => void;
  openEntry: (e: PlanEntry) => void;
  couple: PlanCouple;
} | null>(null);

export function PlanProvider({
  recipes,
  couple = null,
  children,
}: {
  recipes: PlanPickerItem[];
  couple?: PlanCouple;
  children: React.ReactNode;
}) {
  const [pickTarget, setPickTarget] = useState<PickTarget | null>(null);
  const [entry, setEntry] = useState<PlanEntry | null>(null);

  return (
    <Ctx.Provider value={{ openPicker: setPickTarget, openEntry: setEntry, couple }}>
      {children}
      {pickTarget && (
        <PlanPickerSheet
          target={pickTarget}
          recipes={recipes}
          couple={couple}
          onClose={() => setPickTarget(null)}
        />
      )}
      {entry && (
        <PlanEntrySheet
          entry={entry}
          couple={couple}
          onClose={() => setEntry(null)}
          onReplace={() => {
            setPickTarget({ date: entry.plan_date, slot: entry.slot });
            setEntry(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function PlanDay({
  date,
  entries,
  targets,
  isToday,
}: {
  date: string;
  entries: PlanEntry[];
  targets: Targets;
  isToday: boolean;
}) {
  const ctx = useContext(Ctx);
  const bySlot = new Map(entries.map((e) => [e.slot, e]));
  // Totaux PO (part du PO en couple) + part de Sarah dérivée, jamais stockée.
  const totals = entries.reduce(
    (a, e) => {
      const { po, sarah } = planEntryMacros(e);
      return {
        kcal: a.kcal + po.kcal,
        p: a.p + po.protein_g,
        sarahKcal: a.sarahKcal + (sarah?.kcal ?? 0),
        anyForTwo: a.anyForTwo || Boolean(sarah),
      };
    },
    { kcal: 0, p: 0, sarahKcal: 0, anyForTwo: false }
  );
  const kcalOk = withinTolerance(totals.kcal, targets.kcal);

  return (
    <section className="rounded-lg border border-border bg-surface p-3">
      <h2 className={`text-sm font-semibold capitalize ${isToday ? "" : ""}`}>
        {DAY_FMT.format(new Date(`${date}T12:00:00Z`))}
        {isToday && <span className="ml-1.5 text-xs font-normal text-muted">aujourd&apos;hui</span>}
      </h2>
      <div className="mt-2 space-y-1.5">
        {MEAL_SLOTS.map((slot) => {
          const e = bySlot.get(slot);
          if (e) {
            const { po } = planEntryMacros(e);
            const factorLabel = e.for_two
              ? Number(e.total_portion) !== 1
                ? ` ×${Number(e.total_portion)}`
                : ""
              : Number(e.portion_factor) !== 1
                ? ` ×${Number(e.portion_factor)}`
                : "";
            return (
              <button
                key={slot}
                type="button"
                onClick={() => ctx?.openEntry(e)}
                className="flex w-full items-center justify-between gap-2 rounded-md bg-surface-raised px-3 py-2.5 text-left active:opacity-80"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-faint">
                    {SLOT_LABELS[slot]}
                    {e.for_two && (
                      <span className="ml-1 text-primary">· pour 2</span>
                    )}
                  </span>
                  <span className="block truncate text-sm font-medium">
                    {e.recipe?.name ?? "?"}
                    {factorLabel && <span className="text-muted">{factorLabel}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-muted">
                  {po.kcal} kcal
                </span>
              </button>
            );
          }
          return (
            <button
              key={slot}
              type="button"
              onClick={() => ctx?.openPicker({ date, slot })}
              className="flex w-full items-center justify-between rounded-md border border-dashed border-border px-3 py-2.5 text-left text-sm text-faint active:bg-surface-raised"
            >
              <span>{SLOT_LABELS[slot]}</span>
              <Plus size={16} aria-hidden />
            </button>
          );
        })}
      </div>
      {entries.length > 0 && (
        <p className="mt-2 text-right text-xs">
          <span className={kcalOk ? "font-medium text-accent" : "text-muted"}>
            {totals.kcal} kcal
          </span>
          <span className="text-muted">
            {" "}
            ({totals.kcal - targets.kcal >= 0 ? "+" : ""}
            {totals.kcal - targets.kcal}) · {Math.round(totals.p)} P
          </span>
          {totals.anyForTwo && (
            <span className="block text-faint">
              part {ctx?.couple?.name ?? "partenaire"} : {Math.round(totals.sarahKcal)} kcal
            </span>
          )}
        </p>
      )}
    </section>
  );
}

function PlanPickerSheet({
  target,
  recipes,
  couple,
  onClose,
}: {
  target: PickTarget;
  recipes: PlanPickerItem[];
  couple: PlanCouple;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [portion, setPortion] = useState(1);
  const [forTwo, setForTwo] = useState(false);
  const [poShare, setPoShare] = useState(0.5);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Affiché : part du PO. En couple, portion = portions totales cuisinées.
  const share = forTwo ? poShare : 1;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? recipes.filter((r) => r.name.toLowerCase().includes(q))
      : recipes.filter((r) => r.category === target.slot);
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, query, target.slot]);

  function pick(recipeId: string) {
    setError("");
    startTransition(async () => {
      const res = await planMeal({
        date: target.date,
        slot: target.slot,
        recipeId,
        portionFactor: forTwo ? undefined : portion,
        forTwo,
        poShare: forTwo ? poShare : undefined,
        totalPortion: forTwo ? portion : undefined,
      });
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Planifier — ${SLOT_LABELS[target.slot]} · ${target.date.slice(8, 10)}/${target.date.slice(5, 7)}`}
    >
      <div className="space-y-3">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Portion">
          {PORTION_FACTORS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={portion === f}
              onClick={() => setPortion(f)}
              className={`h-10 flex-1 rounded-md border text-sm font-medium ${
                portion === f
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border bg-surface"
              }`}
            >
              ×{f}
            </button>
          ))}
        </div>

        {couple && (
          <div className="rounded-md border border-border bg-surface p-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                Pour deux
                <span className="block text-xs font-normal text-muted">
                  Plat partagé avec {couple.name}. Les portions ci-dessus = plat
                  entier ; le total du jour ne compte que ta part.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={forTwo}
                aria-label="Plat pour deux"
                onClick={() => setForTwo((v) => !v)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  forTwo ? "bg-primary" : "bg-border"
                }`}
              >
                <span
                  className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                    forTwo ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {forTwo && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-primary">
                    Toi {Math.round(poShare * 100)}%
                  </span>
                  <span className="text-muted">
                    {couple.name} {Math.round((1 - poShare) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={poShare}
                  aria-label="Répartition de ta part"
                  onChange={(e) => setPoShare(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            )}
          </div>
        )}

        <label className="flex h-12 items-center gap-2 rounded-md border border-border bg-surface px-3 focus-within:border-muted">
          <MagnifyingGlass size={18} className="shrink-0 text-muted" aria-hidden />
          <input
            type="search"
            placeholder="Rechercher…"
            aria-label="Rechercher une recette"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-base outline-none placeholder:text-muted"
          />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <ul className={`divide-y divide-border rounded-md border border-border ${pending ? "opacity-50" : ""}`}>
          {list.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => pick(r.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-surface"
              >
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="shrink-0 text-sm text-muted">
                  {Math.round(r.kcal * portion * share)} kcal ·{" "}
                  <span className="text-macro-p">
                    {Math.round(Number(r.protein_g) * portion * share)} P
                  </span>
                  {forTwo && <span className="text-faint"> · ta part</span>}
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              Aucune recette — essaie la recherche.
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}

function PlanEntrySheet({
  entry,
  couple,
  onClose,
  onReplace,
}: {
  entry: PlanEntry;
  couple: PlanCouple;
  onClose: () => void;
  onReplace: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const forTwo = Boolean(entry.for_two);
  // En couple, la portion réglée est le plat entier (total_portion).
  const factor = forTwo ? Number(entry.total_portion) : Number(entry.portion_factor);
  const poShare = Number(entry.po_share);

  return (
    <Sheet open onClose={onClose} title={entry.recipe?.name ?? "Entrée du plan"}>
      <div className="space-y-3">
        {forTwo && (
          <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
            Pour deux —{" "}
            <span className="font-medium text-primary">toi {Math.round(poShare * 100)}%</span> ·{" "}
            {couple?.name ?? "partenaire"} {Math.round((1 - poShare) * 100)}%. Pour
            changer la répartition, remplace l&apos;entrée.
          </p>
        )}
        <div>
          <span className="mb-1 block text-sm text-muted">
            {forTwo ? "Portions totales (plat entier)" : "Portion"}
          </span>
          <div className="flex gap-1.5">
            {PORTION_FACTORS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={factor === f}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await updatePlanEntry(entry.id, f, forTwo);
                    if ("error" in res) setError(res.error);
                    else onClose();
                  })
                }
                className={`h-10 flex-1 rounded-md border text-sm font-medium disabled:opacity-50 ${
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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {/* Lot 15 : accès à la fiche recette (ingrédients, étapes) — même fiche
            que l'onglet Recettes et l'écran Aujourd'hui. Action principale : on
            ouvre le plan surtout pour cuisiner. */}
        {recipeHref(entry) && (
          <Link
            href={recipeHref(entry)!}
            className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-3 text-sm font-medium active:bg-surface-raised"
          >
            <span>Voir la recette</span>
            <ArrowSquareOut size={16} aria-hidden className="text-muted" />
          </Link>
        )}
        <button
          type="button"
          onClick={onReplace}
          className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary"
        >
          Remplacer par une autre recette
        </button>
        {confirm ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deletePlanEntry(entry.id);
                  if ("error" in res) setError(res.error);
                  else onClose();
                })
              }
              className="h-12 flex-1 rounded-md bg-destructive font-semibold text-white disabled:opacity-50"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="h-12 flex-1 rounded-md border border-border bg-surface font-medium"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="h-12 w-full rounded-md border border-border font-medium text-destructive"
          >
            Retirer du plan
          </button>
        )}
      </div>
    </Sheet>
  );
}
