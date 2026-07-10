import { notFound } from "next/navigation";
import { brusselsDay, isIsoDate } from "@/lib/brussels-day.mjs";
import { summarizeSets } from "@/lib/last-sets.mjs";
import {
  getExerciseCatalog,
  getLastSets,
  getTemplate,
  getWorkout,
} from "@/lib/training-server";
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
  searchParams: Promise<{ template?: string; date?: string; edit?: string }>;
}) {
  const { template: templateId, date: rawDate, edit: editId } = await searchParams;
  const date = rawDate && isIsoDate(rawDate) ? rawDate : brusselsDay();
  const catalog = (await getExerciseCatalog()).map((e) => ({
    id: e.id,
    name: e.name,
    note: e.note,
  }));

  let title = "Séance vierge";
  let initialExercises: EditorExercise[] = [];
  let meta: { duration: string; intensity: number | null; notes: string } | undefined;
  let workoutDate = date;

  if (editId) {
    const workout = await getWorkout(editId);
    if (!workout || workout.type !== "muscu") notFound();
    title = "Modifier la séance";
    workoutDate = workout.workout_date;
    meta = {
      duration: workout.duration_min == null ? "" : String(workout.duration_min),
      intensity: workout.perceived_intensity,
      notes: workout.notes ?? "",
    };
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
        assist: draft.assist,
        sets: draft.rows,
      };
    });
  } else if (templateId) {
    const template = await getTemplate(templateId);
    if (!template) notFound();
    title = template.name;
    const exercises = template.template_exercises ?? [];
    const lastSets = await getLastSets(exercises.map((t) => t.exercise_id));
    initialExercises = exercises.map((tex) => {
      const last = lastSets.get(tex.exercise_id);
      const base = last?.sets.length
        ? setsToDraft(last.sets)
        : {
            assist: false,
            rows: Array.from({ length: tex.default_sets ?? 3 }, () => ({
              reps: tex.default_reps_min == null ? "" : String(tex.default_reps_min),
              weight: "",
              rpe: "",
            })),
          };
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
        assist: base.assist,
        sets: base.rows,
      };
    });
  }

  return (
    <SessionEditor
      title={title}
      date={workoutDate}
      templateId={templateId ?? null}
      editId={editId ?? null}
      initialExercises={initialExercises}
      catalog={catalog}
      initialMeta={meta}
    />
  );
}
