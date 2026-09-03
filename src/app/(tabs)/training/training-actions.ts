"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/brussels-day.mjs";
import { summarizeSets } from "@/lib/last-sets.mjs";
import {
  formatTarget,
  sessionTarget,
  targetRows,
} from "@/lib/session-target.mjs";
import { getExerciseContext } from "@/lib/training-server";
import { setExerciseTargetWith } from "@/lib/mcp/service";
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

/**
 * Lot 20 : tout ce qu'il faut pour insérer un exercice EN COURS de séance avec
 * les mêmes informations qu'un exercice de template — objectif dans les cases,
 * ligne « Dernière », consignes derrière le ⓘ. Avant, il arrivait vide.
 */
export type ExercisePrefill = {
  exerciseId: string;
  name: string;
  note: string | null;
  repRange: string | null;
  rpe: number | null;
  rest: number | null;
  refSummary: string | null;
  refDate: string | null;
  targetWeight: number | null;
  targetNote: string | null;
  targetLabel: string | null;
  assist: boolean;
  sets: { reps: string; weight: string; rpe: string }[];
};

export async function getExercisePrefill(
  exerciseId: string
): Promise<ExercisePrefill | null> {
  const ctx = await getExerciseContext(exerciseId);
  if (!ctx) return null;
  const { exercise, defaults, last } = ctx;
  const target = sessionTarget({
    defaults,
    targetWeight: exercise.target_weight_kg,
    last,
  });

  return {
    exerciseId: exercise.id,
    name: exercise.name,
    note: exercise.note,
    repRange:
      defaults?.repsMin != null && defaults.repsMax != null
        ? `${defaults.repsMin}-${defaults.repsMax}`
        : null,
    rpe: defaults?.rpe ?? null,
    rest: defaults?.rest ?? null,
    refSummary: last?.sets.length ? summarizeSets(last.sets) : null,
    refDate: last?.workout_date ?? null,
    targetWeight: exercise.target_weight_kg,
    targetNote: exercise.target_weight_note,
    targetLabel: formatTarget(target),
    assist: target.assist,
    sets: targetRows(target),
  };
}

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
  /**
   * Lot 27 : brouillon « En cours » à effacer une fois la séance écrite. Il est
   * supprimé DANS le même aller-retour, volontairement : effacer depuis le
   * client juste avant de naviguer faisait courir trois choses l'une contre
   * l'autre (l'effacement, un autosave encore en vol qui recréait la ligne, et
   * la navigation) — la redirection après « Enregistrer » en sortait parfois
   * perdante.
   */
  draftId?: string | null;
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
    // La séance est écrite : le brouillon n'a plus lieu d'être. Après les sets,
    // jamais avant — un échec d'insertion doit laisser le brouillon intact,
    // sinon la séance serait perdue des deux côtés.
    if (input.draftId) {
      const { error: draftErr } = await supabase
        .from("workout_drafts")
        .delete()
        .eq("id", input.draftId);
      if (draftErr) throw new Error(draftErr.message);
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

// ---------- Lot 27 : séance EN COURS (table workout_drafts) ----------
//
// Le brouillon vivait dans le localStorage du navigateur, et seulement si
// l'utilisateur MODIFIAIT une case. Depuis le Lot 19 les cases arrivent
// pré-remplies à l'objectif : une séance faite comme prévu ne touchait rien,
// donc rien n'était écrit, donc il n'y avait rien à reprendre. Il est
// maintenant en base — visible sur n'importe quel appareil, et survivant à un
// vidage des données du site.
//
// Il reste HORS de `workouts` : rien de ce qui est à moitié saisi ne doit
// entrer dans les statistiques, la « dernière fois » ou les résumés MCP.

// PAS de revalidatePath ici, volontairement : cette action tourne toutes les
// 1,2 s pendant toute la séance, et invalider une route à chaque frappe ferait
// re-rendre l'arbre client en boucle pendant que le PO saisit. Inutile de
// surcroît : l'onglet Training est `force-dynamic` et relit les brouillons à
// chaque navigation. Seuls l'abandon et l'enregistrement invalident.
export async function saveWorkoutDraft(input: {
  id?: string | null;
  date: string;
  type?: WorkoutType;
  templateId?: string | null;
  title: string;
  payload: unknown;
}): Promise<SaveResult> {
  if (!isIsoDate(input.date)) return { error: "Date invalide." };
  const type = input.type ?? "muscu";
  if (!TYPES.includes(type)) return { error: "Type invalide." };
  const title = input.title?.trim() || "Séance";

  const supabase = await createClient();
  const row = {
    workout_date: input.date,
    type,
    template_id: input.templateId ?? null,
    title,
    payload: input.payload as object,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("workout_drafts")
      .update(row)
      .eq("id", input.id)
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    // Le brouillon a pu être terminé ou abandonné depuis un autre onglet : on
    // n'en recrée pas un fantôme dans son dos.
    if (!data) return { error: "Brouillon introuvable (déjà terminé ou abandonné)." };
    return { ok: true, id: data.id };
  }

  const { data, error } = await supabase
    .from("workout_drafts")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { ok: true, id: data.id };
}

// Pas de revalidatePath non plus : l'éditeur appelle ceci juste avant de
// naviguer vers la fiche séance, et invalider une route au moment exact où le
// routeur pousse une autre URL fait courir les deux l'un contre l'autre. La
// ligne « En cours » de l'onglet Training rafraîchit elle-même (router.refresh
// dans DraftCard), et l'onglet est `force-dynamic`.
export async function deleteWorkoutDraft(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_drafts").delete().eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

// ---------- Lot 29 : proposition de progression (✓ / ✗) ----------
//
// Le Lot 14 posait que l'app n'écrit JAMAIS de cible — elles venaient toutes de
// Claude via MCP. Le PO a tranché de l'assouplir pour ce cas précis, et
// seulement par ce chemin : le ✓ passe par `setExerciseTargetWith`, la MÊME
// fonction que l'outil MCP (mêmes validations, même garde-fou de signe). Ce
// n'est donc pas un second écrivain, c'est le même, appelé depuis l'app.
//
// Avec le client de SESSION, pas celui du MCP : `mcpDb()` porte la clé
// service_role et contourne la RLS — un bouton d'interface ne doit pas écrire
// en privilège élevé. Le garde-fou de verify-lot14.sh vérifie exactement ça.

export async function acceptTargetSuggestion(input: {
  exercise_name: string;
  to: number;
  note?: string | null;
}): Promise<ActionResult> {
  if (!Number.isFinite(input.to) || input.to === 0)
    return { error: "Proposition invalide." };
  const supabase = await createClient();
  try {
    await setExerciseTargetWith(supabase, {
      exercise_name: input.exercise_name,
      target_weight_kg: input.to,
      target_weight_note:
        input.note?.trim() ||
        `Progression acceptée : objectif atteint 2 séances d'affilée.`,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Cible non posée." };
  }
  // Une cible acceptée périme le refus précédent : la prochaine proposition
  // portera sur une autre valeur, elle doit pouvoir s'afficher.
  await supabase
    .from("exercises")
    .update({ progression_declined_kg: null })
    .ilike("name", input.exercise_name.trim());
  revalidatePath("/training");
  return { ok: true };
}

export async function declineTargetSuggestion(input: {
  exercise_id: string;
  to: number;
}): Promise<ActionResult> {
  if (!Number.isFinite(input.to)) return { error: "Proposition invalide." };
  const supabase = await createClient();
  // On mémorise la VALEUR refusée, pas un simple « refusé » : dès que la cible
  // bouge, la proposition suivante porte sur un autre chiffre et redevient
  // légitime. Un booléen aurait tu la progression pour toujours.
  const { error } = await supabase
    .from("exercises")
    .update({ progression_declined_kg: input.to })
    .eq("id", input.exercise_id);
  if (error) return { error: error.message };
  revalidatePath("/training");
  return { ok: true };
}
