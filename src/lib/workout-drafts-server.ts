import { createClient } from "@/lib/supabase/server";

/**
 * Lot 27 : une séance commencée et pas encore terminée.
 *
 * Volontairement hors de `workouts` — voir la migration : aucune statistique,
 * aucune « dernière fois », aucun résumé MCP ne doit voir une séance à moitié
 * saisie, et `workouts` est lu depuis 15 endroits.
 */
export type WorkoutDraft = {
  id: string;
  workout_date: string;
  type: string;
  template_id: string | null;
  title: string;
  /** État exact de l'éditeur : saisies incomplètes comprises. */
  payload: unknown;
  started_at: string;
  updated_at: string;
};

/**
 * Brouillons du plus récemment touché au plus ancien, TOUS JOURS CONFONDUS :
 * une séance commencée hier soir doit se reprendre ce matin sans aller la
 * chercher dans le calendrier.
 */
export async function getWorkoutDrafts(): Promise<WorkoutDraft[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_drafts")
    .select("id, workout_date, type, template_id, title, payload, started_at, updated_at")
    .order("updated_at", { ascending: false });
  // Une base pas encore migrée ne doit pas faire écrouler l'onglet Training :
  // sans brouillon, la page rend exactement ce qu'elle rendait avant le lot.
  if (error) {
    console.warn(`getWorkoutDrafts: ${error.message}`);
    return [];
  }
  return (data ?? []) as WorkoutDraft[];
}

export async function getWorkoutDraft(id: string): Promise<WorkoutDraft | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_drafts")
    .select("id, workout_date, type, template_id, title, payload, started_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn(`getWorkoutDraft: ${error.message}`);
    return null;
  }
  return (data as WorkoutDraft | null) ?? null;
}
