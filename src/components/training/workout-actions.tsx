"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilSimple, Trash } from "@phosphor-icons/react";
import { deleteWorkout } from "@/app/(tabs)/training/training-actions";
import type { WorkoutType } from "@/lib/training";

export function WorkoutActions({
  id,
  type,
  date,
}: {
  id: string;
  type: WorkoutType;
  date: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const editHref =
    type === "muscu"
      ? `/training/muscu?edit=${id}`
      : type === "running"
        ? `/training/running?edit=${id}`
        : `/training/autre?edit=${id}`;

  function remove() {
    startTransition(async () => {
      const res = await deleteWorkout(id);
      if ("error" in res) setError(res.error);
      else router.push(`/training/day/${date}`);
    });
  }

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {confirm ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="h-12 flex-1 rounded-md bg-destructive font-semibold text-white disabled:opacity-50"
          >
            Confirmer la suppression
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="h-12 flex-1 rounded-md border border-border bg-surface font-medium"
          >
            Annuler
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Link
            href={editHref}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-on-primary"
          >
            <PencilSimple size={18} aria-hidden />
            Modifier
          </Link>
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md border border-border font-medium text-destructive"
          >
            <Trash size={18} aria-hidden />
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
