"use client";

import { useState } from "react";
import { Barcode } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { BarcodeScan } from "@/components/today/barcode-scan";
import { SLOT_LABELS } from "@/lib/today";

/**
 * Lot 28 : scanner un produit depuis l'accueil (PO : « j'aimerais que le bouton
 * pour scanner les codes barres soit sur la page plan »).
 *
 * Le scan existait déjà, mais enfoui : /journal → « Ajouter » sur un repas →
 * « Scanner ». Trois taps et le bon créneau choisi d'avance, alors qu'on scanne
 * justement parce qu'on ne sait pas encore ce que c'est.
 *
 * Le produit part dans « Extra », le seul créneau qui ne présume de rien (les
 * quatre repas structurés comptent pour le streak, `MEAL_SLOTS`) — et il reste
 * déplaçable depuis le journal. Le composant réutilise `BarcodeScan` tel quel :
 * même lecture Open Food Facts, même alimentation de la référence ingrédients.
 */
export function PlanScanButton({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Scanner un produit"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-muted active:bg-surface"
      >
        <Barcode size={20} />
      </button>
      {open && (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title={`Scanner — ${SLOT_LABELS.extra}`}
        >
          <BarcodeScan
            date={date}
            slot="extra"
            onBack={() => setOpen(false)}
            onDone={() => setOpen(false)}
          />
        </Sheet>
      )}
    </>
  );
}
