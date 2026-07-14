"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/brussels-day.mjs";
import { RUN_TYPES, type RunType, type WorkoutType } from "@/lib/training";

export type SaveResult = { error: string } | { ok: true; id: string };
export type ActionResult = { error: string } | { ok: true };

const TYPES: WorkoutType[] = ["muscu", "running", "padel", "autre"];

export type DraftSet = {
  reps: number | null;
  weight_kg: number | null;
  rpe?: number | null; // effort perçu optionnel (1-10, demi-points) — jamais requis
};
export type DraftExercise = {
  exerciseId?: string;
  name: string; // pour création à la volée si exerciseId absent
  // Lot 18 : contexte qualitatif du mouvement ce jour-là — facultatif,
  // jamais bloquant, distinct de la note de séance (workouts.notes).
  note?: string | null;
  sets: DraftSet[];
};

async function resolveExerciseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ex: DraftExercise
): Promise<string> {
  if (ex.exerciseId) return ex.exerciseId;
  const name = ex.name.trim();
  if (!name) throw new Error("Nom d'exercice vide.");
  const { data: found } = await supabase
    .from("exercises")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (found) return found.id;
  const { data: created, error } = await supabase
    .from("exercises")
    .insert({ name, measure_type: "reps" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

/**
 * Sauvegarde d'une séance (création, ou remplacement complet si id fourni —
 * l'édition d'une séance passée réécrit ses sets, CRUD complet PRD).
 */
export async function saveWorkout(input: {
  id?: string;
  date: string;
  type: WorkoutType;
  templateId?: string | null;
  duration_min?: number | null;
  distance_km?: number | null;
  run_type?: RunType | null;
  perceived_intensity?: number | null;
  notes?: string;
  exercises?: DraftExercise[];
}): Promise<SaveResult> {
  if (!isIsoDate(input.date)) return { error: "Date invalide." };
  if (!TYPES.includes(input.type)) return { error: "Type invalide." };
  if (input.run_type && !RUN_TYPES.includes(input.run_type))
    return { error: "Type de course invalide." };
  if (
    input.perceived_intensity != null &&
    !(input.perceived_intensity >= 1 && input.perceived_intensity <= 10)
  )
    return { error: "Intensité entre 1 et 10." };

  const supabase = await createClient();
  const meta = {
    workout_date: input.date,
    type: input.type,
    template_id: input.templateId ?? null,
    duration_min: input.duration_min ?? null,
    distance_km: input.distance_km ?? null,
    run_type: input.run_type ?? null,
    perceived_intensity: input.perceived_intensity ?? null,
    notes: input.notes?.trim() || null,
  };

  let workoutId = input.id;
  try {
    if (workoutId) {
      const { error } = await supabase
        .from("workouts")
        .update(meta)
        .eq("id", workoutId);
      if (error) throw new Error(error.message);
      const { error: delErr } = await supabase
        .from("workout_sets")
        .delete()
        .eq("workout_id", workoutId);
      if (delErr) throw new Error(delErr.message);
    } else {
      const { data, error } = await supabase
        .from("workouts")
        .insert(meta)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      workoutId = data.id;
    }

    const rows: object[] = [];
    // Lot 18 : une note par (séance, exercice) — remplacement complet, comme
    // les sets (l'édition ré-écrit l'état final envoyé par l'éditeur).
    const noteRows = new Map<string, string>();
    for (const [pos, ex] of (input.exercises ?? []).entries()) {
      const validSets = ex.sets.filter(
        (s) => s.reps != null || s.weight_kg != null
      );
      if (validSets.length === 0) continue;
      const exerciseId = await resolveExerciseId(supabase, ex);
      const note = ex.note?.trim();
      if (note) noteRows.set(exerciseId, note);
      validSets.forEach((s, i) =>
        rows.push({
          workout_id: workoutId,
          exercise_id: exerciseId,
          position: pos + 1,
          set_number: i + 1,
          reps: s.reps,
          weight_kg: s.weight_kg,
          rpe: s.rpe ?? null,
        })
      );
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("workout_sets").insert(rows);
      if (error) throw new Error(error.message);
    }
    const { error: delNotesErr } = await supabase
      .from("workout_exercise_notes")
      .delete()
      .eq("workout_id", workoutId);
    if (delNotesErr) throw new Error(delNotesErr.message);
    if (noteRows.size > 0) {
      const { error: notesErr } = await supabase.from("workout_exercise_notes").insert(
        [...noteRows.entries()].map(([exercise_id, note]) => ({
          workout_id: workoutId,
          exercise_id,
          note,
        }))
      );
      if (notesErr) throw new Error(notesErr.message);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sauvegarde impossible." };
  }

  revalidatePath("/training");
  return { ok: true, id: workoutId! };
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/training");
  return { ok: true };
}

// ---------- Templates (écran de gestion — PAS hardcodés) ----------

export type DraftTemplateExercise = {
  exerciseId?: string;
  name: string;
  default_sets: number | null;
  default_reps_min: number | null;
  default_reps_max: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
};

export async function createTemplate(name: string): Promise<SaveResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nom obligatoire." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_templates")
    .insert({ name: trimmed, type: "muscu" })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/training/templates");
  return { ok: true, id: data.id };
}

export async function saveTemplate(
  id: string,
  input: { name: string; exercises: DraftTemplateExercise[] }
): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { error: "Nom obligatoire." };
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from("workout_templates")
      .update({ name })
      .eq("id", id);
    if (error) throw new Error(error.message);

    const { error: delErr } = await supabase
      .from("template_exercises")
      .delete()
      .eq("template_id", id);
    if (delErr) throw new Error(delErr.message);

    const rows: object[] = [];
    for (const [pos, ex] of input.exercises.entries()) {
      if (!ex.name.trim()) continue;
      const exerciseId = await resolveExerciseId(supabase, {
        exerciseId: ex.exerciseId,
        name: ex.name,
        sets: [],
      });
      rows.push({
        template_id: id,
        exercise_id: exerciseId,
        position: pos + 1,
        default_sets: ex.default_sets,
        default_reps_min: ex.default_reps_min,
        default_reps_max: ex.default_reps_max,
        target_rpe: ex.target_rpe,
        rest_seconds: ex.rest_seconds,
      });
    }
    if (rows.length > 0) {
      const { error: insErr } = await supabase
        .from("template_exercises")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sauvegarde impossible." };
  }
  revalidatePath("/training/templates");
  return { ok: true };
}

export async function archiveTemplate(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workout_templates")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/training/templates");
  revalidatePath("/training");
  return { ok: true };
}
