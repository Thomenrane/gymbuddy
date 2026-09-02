"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { formatCountdown } from "@/lib/session-controls.mjs";

/**
 * Lot 24 : chrono de repos.
 *
 * `rest_seconds` existait déjà dans les templates mais n'était qu'un texte
 * affiché — le PO chronométrait de tête ou pas du tout. Barre fixe au-dessus de
 * la barre d'onglets, vibration à zéro, arrêt d'un tap.
 *
 * L'échéance est une DATE, pas un compteur décrémenté : un timer JS mis en
 * veille par le navigateur en arrière-plan dériverait, alors qu'une échéance
 * reste juste au retour à l'écran.
 */
export function RestTimer({
  endsAt,
  total,
  onDone,
  onCancel,
}: {
  endsAt: number;
  total: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, (endsAt - Date.now()) / 1000)
  );

  // Le parent remonte le composant à chaque nouveau repos (`key={endsAt}`),
  // donc l'état de départ vient de l'initialiseur : pas de setState dans le
  // corps de l'effet, pas de rendu en cascade.
  const fired = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(0, (endsAt - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          /* vibration indisponible (desktop, iOS) : le visuel suffit */
        }
        onDone();
      }
    }, 250);
    return () => clearInterval(id);
  }, [endsAt, onDone]);

  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <div
      role="timer"
      aria-label="Repos en cours"
      className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-md px-4 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-lg">
        <span className="text-sm text-muted">Repos</span>
        <span className="font-mono text-lg font-semibold tabular-nums">
          {formatCountdown(remaining)}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <button
          type="button"
          aria-label="Arrêter le repos"
          onClick={onCancel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted active:bg-surface"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
