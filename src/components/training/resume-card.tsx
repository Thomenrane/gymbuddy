"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, X } from "@phosphor-icons/react";
import {
  draftProgress,
  isResumable,
  resumeHref,
  sortedDrafts,
} from "@/lib/session-draft.mjs";
import { draftsStore, type SessionDraft } from "@/lib/session-drafts-store";

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** « 13:32 » — heure de début, stable au rendu (dérivée d'un timestamp stocké). */
const startLabel = (ts: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  }).format(new Date(ts));

/**
 * Lot 22 : « quand je quitte et que je reviens au milieu d'une séance faudrait
 * un indicateur "reprendre" sur la ligne de la session en cours ».
 *
 * Les brouillons vivent dans localStorage : ce composant rend `null` côté
 * serveur et se remplit à l'hydratation (aucun décalage possible). `today` vient
 * du serveur pour éviter un Date.now() au rendu.
 */
export function ResumeCard({ today }: { today: string }) {
  const index = useSyncExternalStore(
    draftsStore.subscribe,
    draftsStore.get,
    draftsStore.getServer
  );

  // Ménage des brouillons > 24 h, à l'affichage. N'écrit que s'il y a à jeter.
  useEffect(() => {
    draftsStore.purge(Date.now());
  }, []);

  const drafts = (sortedDrafts(index) as SessionDraft[]).filter(isResumable);
  if (drafts.length === 0) return null;

  return (
    <section className="space-y-2">
      {drafts.map((draft) => {
        const { done, total } = draftProgress(draft.exercises);
        return (
          <div
            key={draft.key}
            className="flex items-center gap-3 rounded-lg border border-primary bg-surface p-3"
          >
            <Link href={resumeHref(draft)} className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-primary">Reprendre</span>
                <span className="truncate text-sm">{draft.title}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {done}/{total} séries · commencée à {startLabel(draft.startedAt)}
                {draft.date !== today && (
                  <span className="text-faint"> · {shortDate(draft.date)}</span>
                )}
              </p>
            </Link>
            <Link
              href={resumeHref(draft)}
              aria-label={`Reprendre ${draft.title}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary"
            >
              <ArrowRight size={18} weight="bold" />
            </Link>
            <button
              type="button"
              aria-label={`Abandonner ${draft.title}`}
              onClick={() => draftsStore.remove(draft.key)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted active:bg-surface-raised"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
