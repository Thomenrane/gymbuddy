"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { logFreeMeal, logMealFromRecipe } from "@/app/(tabs)/today-actions";
import {
  PORTION_FACTORS,
  SLOT_LABELS,
  type Slot,
} from "@/lib/today";

export type PickerItem = {
  id: string;
  name: string;
  category: string;
  kcal: number;
  protein_g: number;
  prep_min: number | null;
  lastLoggedAt: string | null;
};

const AddLogCtx = createContext<{ open: (slot: Slot) => void } | null>(null);

export function AddLogButton({ slot }: { slot: Slot }) {
  const ctx = useContext(AddLogCtx);
  return (
    <button
      type="button"
      onClick={() => ctx?.open(slot)}
      className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-sm font-medium text-muted active:bg-surface"
    >
      <Plus size={16} aria-hidden />
      Ajouter
    </button>
  );
}

export function TodayProvider({
  date,
  recipes,
  children,
}: {
  date: string;
  recipes: PickerItem[];
  children: React.ReactNode;
}) {
  const [slot, setSlot] = useState<Slot | null>(null);
  return (
    <AddLogCtx.Provider value={{ open: setSlot }}>
      {children}
      {slot && (
        <AddLogSheet
          slot={slot}
          date={date}
          recipes={recipes}
          onClose={() => setSlot(null)}
        />
      )}
    </AddLogCtx.Provider>
  );
}

const inputCls =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted";

function AddLogSheet({
  slot,
  date,
  recipes,
  onClose,
}: {
  slot: Slot;
  date: string;
  recipes: PickerItem[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"picker" | "libre">("picker");
  const [portion, setPortion] = useState(1);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Filtre catégorie du slot (extra = tout), recherche = tout le livre.
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? recipes.filter((r) => r.name.toLowerCase().includes(q))
      : slot === "extra"
        ? recipes
        : recipes.filter((r) => r.category === slot);
    return [...base].sort((a, b) => {
      if (a.lastLoggedAt && b.lastLoggedAt)
        return a.lastLoggedAt < b.lastLoggedAt ? 1 : -1;
      if (a.lastLoggedAt) return -1;
      if (b.lastLoggedAt) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [recipes, slot, query]);

  function pick(recipeId: string) {
    setError("");
    startTransition(async () => {
      const res = await logMealFromRecipe({
        date,
        slot,
        recipeId,
        portionFactor: portion,
      });
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={`Ajouter — ${SLOT_LABELS[slot]}`}>
      {mode === "picker" ? (
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

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}

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
                    <span className="font-medium text-foreground">
                      {portion === 1 ? r.kcal : Math.round(r.kcal * portion)}
                    </span>{" "}
                    kcal ·{" "}
                    <span className="text-macro-p">
                      {Math.round(Number(r.protein_g) * portion)} P
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted">
                Aucune recette. Essaie la recherche ou le log libre.
              </li>
            )}
          </ul>

          <button
            type="button"
            onClick={() => setMode("libre")}
            className="h-11 w-full rounded-md border border-border bg-surface text-sm font-medium"
          >
            Log libre (resto, plat non répertorié…)
          </button>
        </div>
      ) : (
        <FreeLogForm
          date={date}
          slot={slot}
          onBack={() => setMode("picker")}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function FreeLogForm({
  date,
  slot,
  onBack,
  onDone,
}: {
  date: string;
  slot: Slot;
  onBack: () => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [g, setG] = useState("");
  const [l, setL] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const n = (s: string) => Number(s.replace(",", ".")) || 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await logFreeMeal({
        date,
        slot,
        label,
        kcal: n(kcal),
        protein_g: n(p),
        carbs_g: n(g),
        fat_g: n(l),
        notes,
      });
      if ("error" in res) setError(res.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        required
        placeholder="Resto italien, tartiflette…"
        aria-label="Nom du log libre"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">kcal *</span>
          <input required inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className={inputCls} />
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
        placeholder="Notes (optionnel)"
        aria-label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className={inputCls}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="h-12 flex-1 rounded-md border border-border bg-surface font-medium">
          Retour
        </button>
        <button type="submit" disabled={pending} className="h-12 flex-[2] rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50">
          {pending ? "Ajout…" : "Logger"}
        </button>
      </div>
    </form>
  );
}
