"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, CheckCircle, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import {
  BASIS_LABEL,
  ProductInfo,
  ProductScanner,
  type FoundProduct,
} from "@/components/today/barcode-scan";
import { addScannedIngredient } from "@/app/(tabs)/today-actions";
import { deleteIngredientRef } from "@/app/(tabs)/recettes/actions";
import type { NutritionRefRow } from "@/lib/recipes-server";

// Page Ingrédients (Lot 17) : les produits scannés d'abord (c'est ce qui est
// vraiment mangé), le reste de la référence (seed CIQUAL + ajouts Claude/PO)
// replié. Suppression possible sauf pour le seed. Scan direct → référence.

const SOURCE_LABEL: Record<string, string> = {
  off: "scanné",
  seed: "CIQUAL",
  claude: "Claude",
  florian: "toi",
};

export function IngredientRefs({ rows }: { rows: NutritionRefRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [showBase, setShowBase] = useState(false);

  const q = query.trim().toLowerCase();
  const match = (r: NutritionRefRow) => !q || r.item.toLowerCase().includes(q);
  const scanned = useMemo(
    () =>
      rows
        .filter((r) => r.source === "off")
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .filter(match),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, q]
  );
  const base = useMemo(
    () => rows.filter((r) => r.source !== "off").filter(match),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, q]
  );
  const unverified = rows.filter((r) => !r.verified).length;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary font-semibold text-on-primary"
      >
        <Barcode size={20} aria-hidden />
        Scanner un produit
      </button>

      <label className="flex h-12 items-center gap-2 rounded-md border border-border bg-surface px-3 focus-within:border-muted">
        <MagnifyingGlass size={18} className="shrink-0 text-muted" aria-hidden />
        <input
          type="search"
          placeholder="Rechercher un ingrédient…"
          aria-label="Rechercher un ingrédient"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-base outline-none placeholder:text-muted"
        />
      </label>

      <section>
        <h2 className="text-sm font-medium text-muted">
          Produits scannés ({scanned.length})
          {unverified > 0 && (
            <span className="ml-2 rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs">
              {unverified} à vérifier
            </span>
          )}
        </h2>
        {scanned.length === 0 ? (
          <p className="mt-2 rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted">
            Aucun produit scanné{q ? " ne correspond" : " pour l'instant"}.
            Scanne tes produits : leurs valeurs étiquette exactes serviront à
            composer et vérifier les recettes.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {scanned.map((r) => (
              <RefRow key={r.id} row={r} onDeleted={() => router.refresh()} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setShowBase((v) => !v)}
          aria-expanded={showBase}
          className="text-sm font-medium text-muted"
        >
          Référence de base — CIQUAL &amp; ajouts ({base.length}){" "}
          {showBase ? "▾" : "▸"}
        </button>
        {showBase && (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {base.map((r) => (
              <RefRow key={r.id} row={r} onDeleted={() => router.refresh()} />
            ))}
          </ul>
        )}
      </section>

      {scanOpen && (
        <ScanToRefSheet
          onClose={() => {
            setScanOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RefRow({
  row,
  onDeleted,
}: {
  row: NutritionRefRow;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const deletable = row.source !== "seed";

  function del() {
    setPending(true);
    deleteIngredientRef(row.id)
      .then((res) => {
        if ("error" in res) setError(res.error);
        else onDeleted();
      })
      .finally(() => setPending(false));
  }

  return (
    <li className="px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate">
            {row.item}
            {!row.verified && (
              <span className="ml-1.5 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-xs text-muted">
                à vérifier
              </span>
            )}
          </p>
          <p className="text-sm text-muted">
            {Math.round(row.kcal)} kcal ·{" "}
            <span className="text-macro-p">{row.protein_g} P</span> ·{" "}
            {row.carbs_g} G · {row.fat_g} L
            <span className="text-faint"> / {BASIS_LABEL[row.basis] ?? row.basis}</span>
            <span className="text-faint"> · {SOURCE_LABEL[row.source] ?? row.source}</span>
          </p>
        </div>
        {deletable &&
          (confirm ? (
            <button
              type="button"
              disabled={pending}
              onClick={del}
              className="h-9 shrink-0 rounded-md border border-destructive px-2.5 text-sm font-medium text-destructive disabled:opacity-50"
            >
              Confirmer ?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              aria-label={`Supprimer ${row.item}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted active:bg-surface-raised"
            >
              <Trash size={18} />
            </button>
          ))}
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
    </li>
  );
}

/** Sheet : scan → fiche → ajout direct à la référence (sans log de repas). */
function ScanToRefSheet({ onClose }: { onClose: () => void }) {
  const [ean, setEan] = useState<string | null>(null);
  const [product, setProduct] = useState<FoundProduct | null>(null);
  const [added, setAdded] = useState<{ item: string; verified: boolean } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function add() {
    if (!product || !ean) return;
    setError("");
    setPending(true);
    addScannedIngredient({
      ean,
      name: product.name ?? "",
      brand: product.brand,
      per100g: product.per100g,
    })
      .then((res) => {
        if ("error" in res) setError(res.error);
        else setAdded({ item: res.item, verified: res.verified });
      })
      .finally(() => setPending(false));
  }

  return (
    <Sheet open onClose={onClose} title="Scanner un produit">
      {!product || !ean ? (
        <ProductScanner
          onProduct={(c, p) => {
            setEan(c);
            setProduct(p);
          }}
          onBack={onClose}
          hint="Le produit rejoint la référence ingrédients avec ses valeurs étiquette exactes."
        />
      ) : (
        <div className="space-y-3">
          <ProductInfo product={product} />
          {added ? (
            <p className="flex items-start gap-1.5 rounded-md border border-border bg-surface p-3 text-sm">
              <CheckCircle size={18} className="mt-px shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-medium">« {added.item} »</span> ajouté à
                la référence.
                {!added.verified && " (fiche incomplète : marqué « à vérifier »)"}
              </span>
            </p>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={add}
              className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
            >
              Ajouter à la référence ingrédients
            </button>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-md border border-border bg-surface font-medium"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={() => {
                setProduct(null);
                setEan(null);
                setAdded(null);
                setError("");
              }}
              className="h-12 flex-1 rounded-md border border-border bg-surface font-medium"
            >
              Scanner un autre
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
