"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Aujourd'hui", icon: "🍽️" },
  { href: "/training", label: "Training", icon: "🏋️" },
  { href: "/recettes", label: "Recettes", icon: "📖" },
  { href: "/tendances", label: "Tendances", icon: "📈" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                active ? "text-emerald-400" : "text-neutral-400"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
