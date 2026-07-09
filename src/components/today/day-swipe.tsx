"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { dayNavTargets } from "@/lib/today";

// Lot 10 — swipe horizontal pour changer de jour, MÊME logique que les
// chevrons (dayNavTargets) : droite = jour précédent, gauche = suivant,
// pas de futur au-delà d'aujourd'hui. Le swipe est ignoré s'il démarre
// dans un élément marqué [data-noswipe] (sheets, zones scrollables).
const THRESHOLD = 60; // px de déplacement horizontal minimal
const RATIO = 1.5; // dominance horizontale sur le vertical (évite le scroll)

export function DaySwipe({
  date,
  today,
  children,
}: {
  date: string;
  today: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).closest("[data-noswipe]")) {
      start.current = null;
      return;
    }
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * RATIO) return;

    const { prev, next } = dayNavTargets(date, today);
    if (dx > 0) router.push(`/?date=${prev}`); // swipe → : jour précédent
    else if (next) router.push(`/?date=${next}`); // swipe ← : jour suivant
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}
