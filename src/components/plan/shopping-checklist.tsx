"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

type ShoppingItem = { item: string; qty: number; unit: string; rayon: string };

// Cases à cocher en état LOCAL uniquement (addendum PRD v2.1 — pas de
// persistance des coches en v1). La copie utilise le texte brut pré-généré.
export function ShoppingChecklist({
  items,
  text,
}: {
  items: ShoppingItem[];
  text: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const byRayon = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const it of items) {
      map.set(it.rayon, [...(map.get(it.rayon) ?? []), it]);
    }
    return [...map.entries()];
  }, [items]);

  const keyOf = (it: ShoppingItem) => `${it.item}|${it.unit}`;
  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponible (http, permissions) — pas bloquant
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={copy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface text-sm font-medium active:bg-surface-raised"
      >
        {copied ? (
          <>
            <Check size={16} className="text-accent" aria-hidden /> Copié
          </>
        ) : (
          <>
            <Copy size={16} aria-hidden /> Copier la liste
          </>
        )}
      </button>

      {byRayon.map(([rayon, rows]) => (
        <section key={rayon}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {rayon}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {rows.map((it) => {
              const key = keyOf(it);
              const done = checked.has(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => toggle(key)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-raised"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        done
                          ? "border-accent bg-accent text-background"
                          : "border-border"
                      }`}
                      aria-hidden
                    >
                      {done && <Check size={14} weight="bold" />}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        done ? "text-faint line-through" : ""
                      }`}
                    >
                      {it.item}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted">
                      {it.qty} {it.unit}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
