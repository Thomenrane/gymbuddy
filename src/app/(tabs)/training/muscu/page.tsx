import { notFound } from "next/navigation";
import { brusselsDay, isIsoDate } from "@/lib/brussels-day.mjs";
import { summarizeSets } from "@/lib/last-sets.mjs";
import {
  formatTarget,
  sessionTarget,
  targetRows,
} from "@/lib/session-target.mjs";
import { getWorkoutDraft } from "@/lib/workout-drafts-server";
import {
  getExerciseCatalog,
  getLastSets,
  getRecentSessions,
  getTemplate,
  getWorkout,
} from "@/lib/training-server";
import { suggestNextTarget } from "@/lib/progression.mjs";
import {
  SessionEditor,
  type EditorExercise,
} from "@/components/training/session-editor";

export const dynamic = "force-dynamic";

const setsToDraft = (
  sets: { reps: number | null; weight_kg: number | null; rpe?: number | null }[]
) => ({
  assist: sets.some((s) => (Number(s.weight_kg) || 0) < 0),
  rows: sets.map((s) => ({
    reps: s.reps == null ? "" : String(s.reps),
    weight: s.weight_kg == null ? "" : String(Math.abs(Number(s.weight_kg))),
    // Édition d'une séance passée : on ré-affiche le RPE saisi. Pré-remplissage
    // depuis un template : pas de RPE (ressenti frais à chaque séance).
    rpe: s.rpe == null ? "" : String(s.rpe),
  })),
});

export default async function MuscuSessionPage({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string;
    date?: string;
    edit?: string;
    draft?: string;
  }>;
}) {
  const {
    template: templateId,
    date: rawDate,
    edit: editId,
    draft: draftId,
  } = await searchParams;
  const date = rawDate && isIsoDate(rawDate) ? rawDate : brusselsDay();
  const fullCatalog = await getExerciseCatalog();
  const catalog = fullCatalog.map((e) => ({
    id: e.id,
    name: e.name,
    note: e.note,
  }));
  // Lot 14 : cible de poids par exercice (posée par Claude), pour l'affichage.
  const targetById = new Map(
    fullCatalog.map((e) => [
      e.id,
      { weight: e.target_weight_kg, note: e.target_weight_note },
    ])
  );

  let title = "Séance vierge";
  let initialExercises: EditorExercise[] = [];
  let meta: { duration: string; intensity: number | null; notes: string } | undefined;
  let workoutDate = date;
  let draftStartedAt: number | null = null;
  let resumedDraftId: string | null = null;
  let resumedTemplateId: string | null = null;

  if (draftId) {
    // Lot 27 : reprise d'une séance en cours. Le brouillon porte l'état exact
    // de l'éditeur — on ne re-calcule PAS l'objectif par-dessus, sinon la
    // reprise écraserait ce qui a été saisi.
    const draft = await getWorkoutDraft(draftId);
    if (!draft) notFound();
    const payload = draft.payload as {
      exercises?: EditorExercise[];
      startedAt?: number;
    } | null;
    const saved = payload?.exercises;
    if (!Array.isArray(saved) || saved.length === 0) notFound();
    title = draft.title;
    workoutDate = draft.workout_date;
    initialExercises = saved;
    draftStartedAt = typeof payload?.startedAt === "number" ? payload.startedAt : null;
    resumedDraftId = draft.id;
    // Sans ça, la première ré-écriture du brouillon repris perdrait le lien au
    // template (l'URL de reprise ne porte que ?draft=).
    resumedTemplateId = draft.template_id;
  } else if (editId) {
    const workout = await getWorkout(editId);
    if (!workout || workout.type !== "muscu") notFound();
    title = "Modifier la séance";
    workoutDate = workout.workout_date;
    meta = {
      duration: workout.duration_min == null ? "" : String(workout.duration_min),
      intensity: workout.perceived_intensity,
      notes: workout.notes ?? "",
    };
    const noteByExercise = new Map(
      (workout.exercise_notes ?? []).map((n) => [n.exercise_id, n.note])
    );
    const byPosition = new Map<number, typeof workout.workout_sets & object>();
    const sets = [...(workout.workout_sets ?? [])].sort(
      (a, b) => a.position - b.position || a.set_number - b.set_number
    );
    for (const s of sets) {
      const arr = (byPosition.get(s.position) as typeof sets) ?? [];
      arr.push(s);
      byPosition.set(s.position, arr as never);
    }
    initialExercises = [...byPosition.entries()].map(([pos, group]) => {
      const g = group as typeof sets;
      const draft = setsToDraft(g);
      return {
        key: `edit-${pos}`,
        exerciseId: g[0].exercise_id,
        name: g[0].exercise?.name ?? "?",
        note: catalog.find((c) => c.id === g[0].exercise_id)?.note ?? null,
        targetWeight: targetById.get(g[0].exercise_id)?.weight ?? null,
        targetNote: targetById.get(g[0].exercise_id)?.note ?? null,
        // Lot 18 : ré-affiche la note d'exercice saisie (édition d'une séance).
        sessionNote: noteByExercise.get(g[0].exercise_id) ?? "",
        assist: draft.assist,
        sets: draft.rows,
      };
    });
  } else if (templateId) {
    const template = await getTemplate(templateId);
    if (!template) notFound();
    title = template.name;
    const exercises = template.template_exercises ?? [];
    const ids = exercises.map((t) => t.exercise_id);
    // Lot 29 : deux dernières SÉANCES par exercice — « objectif atteint 2×
    // d'affilée » ne se juge pas sur la dernière séance seule.
    const [lastSets, recent] = await Promise.all([getLastSets(ids), getRecentSessions(ids, 2)]);
    initialExercises = exercises.map((tex) => {
      const last = lastSets.get(tex.exercise_id);
      // Lot 19 : les cases portent l'OBJECTIF du jour (template + cible Claude
      // + dernière perf), plus la dernière perf recopiée telle quelle.
      const target = sessionTarget({
        defaults: {
          sets: tex.default_sets,
          repsMin: tex.default_reps_min,
          repsMax: tex.default_reps_max,
        },
        targetWeight: tex.exercise.target_weight_kg,
        last: last ?? null,
      });
      // La proposition est calculée à la LECTURE : une proposition stockée
      // deviendrait fausse dès la séance suivante enregistrée ou corrigée.
      const suggestion = suggestNextTarget({
        sessions: recent.get(tex.exercise_id) ?? [],
        defaults: { repsMax: tex.default_reps_max, targetRpe: tex.target_rpe },
        signedTarget: tex.exercise.target_weight_kg,
        step: tex.exercise.progression_step_kg,
        declined: tex.exercise.progression_declined_kg,
      });
      return {
        key: `tpl-${tex.position}`,
        exerciseId: tex.exercise_id,
        name: tex.exercise.name,
        note: tex.exercise.note,
        repRange:
          tex.default_reps_min != null && tex.default_reps_max != null
            ? `${tex.default_reps_min}-${tex.default_reps_max}`
            : null,
        rpe: tex.target_rpe,
        rest: tex.rest_seconds,
        refSummary: last?.sets.length ? summarizeSets(last.sets) : null,
        refDate: last?.workout_date ?? null,
        targetWeight: tex.exercise.target_weight_kg,
        targetNote: tex.exercise.target_weight_note,
        targetLabel: formatTarget(target),
        suggestion,
        assist: target.assist,
        sets: targetRows(target),
      };
    });
  }

  return (
    <SessionEditor
      title={title}
      date={workoutDate}
      templateId={resumedTemplateId ?? templateId ?? null}
      editId={editId ?? null}
      draftId={resumedDraftId}
      draftStartedAt={draftStartedAt}
      initialExercises={initialExercises}
      catalog={catalog}
      initialMeta={meta}
    />
  );
}
