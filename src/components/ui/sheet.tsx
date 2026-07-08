"use client";

import { X } from "@phosphor-icons/react";

// Bottom sheet minimaliste : overlay scrim 60% + panneau bas.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Fermer"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-lg border-t border-border bg-background px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
