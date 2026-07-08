"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ForkKnife,
  Barbell,
  BookOpen,
  ChartLineUp,
  type Icon,
} from "@phosphor-icons/react";

const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: "/", label: "Aujourd'hui", icon: ForkKnife },
  { href: "/training", label: "Training", icon: Barbell },
  { href: "/recettes", label: "Recettes", icon: BookOpen },
  { href: "/tendances", label: "Tendances", icon: ChartLineUp },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const IconComp = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors active:opacity-70 ${
                active ? "text-primary" : "text-muted"
              }`}
            >
              <IconComp size={24} weight={active ? "fill" : "regular"} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
