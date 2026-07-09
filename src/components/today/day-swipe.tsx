"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { dayNavTargets } from "@/lib/today";

// Lot 10 + fluidité — swipe horizontal pour changer de jour, MÊME logique
// que les chevrons (dayNavTargets). Le contenu suit le doigt (transform
// direct via ref, ZÉRO re-render React → pas de jank), rebondit si le
// geste est trop court ou interdit (pas de futur au-delà d'aujourd'hui),
// et le jour entrant fait un fondu discret (.day-in, keyé par date).
// Ignoré si le geste démarre dans une zone [data-noswipe] (sheets).
const THRESHOLD = 55; // px pour valider le changement de jour
const MAX = 90; // amplitude max du suivi (px)
const DAMP = 0.45; // amortissement du suivi

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
  const inner = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"?" | "h" | "v">("?");

  function setTransform(x: number, opacity = 1, animate = false) {
    const el = inner.current;
    if (!el) return;
    el.style.transition = animate ? "transform .2s ease, opacity .2s ease" : "";
    el.style.transform = x === 0 ? "" : `translateX(${x}px)`;
    el.style.opacity = String(opacity);
  }

  function onTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).closest("[data-noswipe]")) {
      start.current = null;
      return;
    }
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    axis.current = "?";
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;

    if (axis.current === "?") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis.current !== "h") return; // laisse le scroll vertical

    const { next } = dayNavTargets(date, today);
    const allowed = dx > 0 || next !== null; // gauche interdit à aujourd'hui
    const eff = allowed ? dx : dx * 0.15; // résistance si interdit
    const x = Math.max(-MAX, Math.min(MAX, eff * DAMP));
    setTransform(x, 1 - Math.min(0.2, Math.abs(x) / (MAX * 5)));
  }

  function onTouchEnd(e: React.TouchEvent) {
    const s = start.current;
    start.current = null;
    if (!s || axis.current !== "h") return;
    const dx = e.changedTouches[0].clientX - s.x;
    const { prev, next } = dayNavTargets(date, today);

    if (dx >= THRESHOLD) {
      router.push(`/?date=${prev}`); // swipe → : jour précédent
    } else if (dx <= -THRESHOLD && next) {
      router.push(`/?date=${next}`); // swipe ← : jour suivant
    } else {
      setTransform(0, 1, true); // trop court : retour élastique
    }
  }

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div key={date} ref={inner} className="day-in [will-change:transform]">
        {children}
      </div>
    </div>
  );
}
