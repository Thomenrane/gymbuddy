"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretRight, X } from "@phosphor-icons/react";
import { deleteWorkoutDraft } from "@/app/(tabs)/training/training-actions";
import type { WorkoutDraft } from "@/lib/workout-drafts-server";

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** « 13:32 » — heure de début, rendue côté serveur comme côté client. */
const startLabel = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  }).format(new Date(iso));

/**
 * Lot 27 : la séance en cours, au même emplacement qu'une séance terminée.
 *
 * Demande PO : « je devrais pouvoir la voir en "En cours" sur la page Training,
 * au même emplacement qu'une session terminée → je dois pouvoir cliquer dessus
 * et revenir pour continuer ma séance ».
 *
 * Volontairement PAS de « 7/12 séries » : les cases arrivent pré-remplies à
 * l'objectif depuis le Lot 19, donc toute progression calculée sur le
 * remplissage afficherait 12/12 dès l'ouverture. Le nombre d'exercices et
 * l'heure de début, eux, sont vrais.
 */
export function DraftCard({ draft, today }: { draft: WorkoutDraft; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const payload = draft.payload as { exercises?: unknown[] } | null;
  const count = Array.isArray(payload?.exercises) ? payload.exercises.length : 0;

  return (
    <div className="flex items-stretch gap-2 rounded-lg border border-primary bg-surface">
      <Link
        href={`/training/muscu?draft=${draft.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 p-4 active:bg-surface-raised"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">
              En cours
            </span>
            <span className="truncate font-semibold">{draft.title}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {count > 0 ? `${count} exercice${count > 1 ? "s" : ""} · ` : ""}
            commencée à {startLabel(draft.started_at)}
            {draft.workout_date !== today && (
              <span className="text-faint"> · {shortDate(draft.workout_date)}</span>
            )}
          </p>
        </div>
        <CaretRight size={18} className="shrink-0 text-primary" aria-hidden />
      </Link>
      <button
        type="button"
        aria-label={`Abandonner ${draft.title}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deleteWorkoutDraft(draft.id);
            router.refresh();
          })
        }
        className="flex w-12 shrink-0 items-center justify-center rounded-r-lg text-muted active:bg-surface-raised disabled:opacity-50"
      >
        <X size={16} />
      </button>
    </div>
  );
}
