import { timingSafeEqual } from "node:crypto";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import * as svc from "@/lib/mcp/service";

export const runtime = "nodejs";
export const maxDuration = 60;

// Chaque tool renvoie du JSON sérialisé ; les erreurs métier deviennent
// des réponses isError lisibles par Claude (jamais de stack, jamais de secret).
function jsonTool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      const result = await fn(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue.";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  };
}

const date = z.string().describe("Date YYYY-MM-DD (jour local Europe/Brussels)");
const slot = z.enum(["petit_dej", "dejeuner", "collation", "diner", "extra"]);
const category = z.enum(["petit_dej", "dejeuner", "collation", "diner"]);
const ingredient = z.object({
  item: z.string(),
  qty: z.number(),
  unit: z.string(),
  note: z.string().optional(),
});

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "get_targets",
      "Cibles journalières actuelles (kcal, protéines, glucides, lipides, fibres).",
      {},
      jsonTool(() => svc.getTargets())
    );

    server.tool(
      "update_targets",
      "Met à jour les cibles journalières (champs partiels).",
      {
        kcal: z.number().optional(),
        protein_g: z.number().optional(),
        carbs_g: z.number().optional(),
        fat_g: z.number().optional(),
        fiber_g: z.number().optional(),
      },
      jsonTool((args) => svc.updateTargets(args))
    );

    server.tool(
      "get_day",
      "Journée complète : logs repas, totaux, delta vs cibles, séances, pesée.",
      { date },
      jsonTool(({ date }) => svc.getDay(date))
    );

    server.tool(
      "get_summary",
      "Résumé d'une période : moyennes kcal/macros des jours loggés, poids (brut + moyenne hebdo), séances par type, compteurs Alan (tags).",
      { start_date: date, end_date: date },
      jsonTool(({ start_date, end_date }) => svc.getSummary(start_date, end_date))
    );

    server.tool(
      "search_recipes",
      "Recherche dans le livre de recettes (nom, catégorie, tags). Renvoie les macros.",
      {
        query: z.string().optional(),
        category: category.optional(),
        tags: z.array(z.string()).optional(),
      },
      jsonTool((args) => svc.searchRecipes(args))
    );

    server.tool(
      "add_recipe",
      "Ajoute une recette (source='claude'). Ingrédients quantifiés obligatoires.",
      {
        name: z.string(),
        category,
        kcal: z.number(),
        protein_g: z.number(),
        carbs_g: z.number(),
        fat_g: z.number(),
        fiber_g: z.number().optional(),
        ingredients: z.array(ingredient).min(1),
        steps: z.array(z.string()).optional(),
        prep_min: z.number().optional(),
        tags: z.array(z.string()).optional(),
      },
      jsonTool((args) => svc.addRecipe(args))
    );

    server.tool(
      "update_recipe",
      "Modifie une recette existante (champs partiels). Ne réécrit jamais les logs passés.",
      {
        id: z.string().describe("uuid de la recette"),
        name: z.string().optional(),
        category: category.optional(),
        kcal: z.number().optional(),
        protein_g: z.number().optional(),
        carbs_g: z.number().optional(),
        fat_g: z.number().optional(),
        fiber_g: z.number().optional(),
        ingredients: z.array(ingredient).optional(),
        steps: z.array(z.string()).optional(),
        prep_min: z.number().optional(),
        tags: z.array(z.string()).optional(),
        is_active: z.boolean().optional(),
      },
      jsonTool(({ id, ...fields }) => svc.updateRecipe(id, fields))
    );

    server.tool(
      "log_meal",
      "Logge un repas : recipe_code (macros = recette × portion, figées) OU free_label + macros manuelles (kcal obligatoire). date par défaut : aujourd'hui (Bruxelles).",
      {
        date: date.optional(),
        slot,
        recipe_code: z.string().optional(),
        portion_factor: z.number().optional(),
        free_label: z.string().optional(),
        macros: z
          .object({
            kcal: z.number(),
            protein_g: z.number().optional(),
            carbs_g: z.number().optional(),
            fat_g: z.number().optional(),
          })
          .optional(),
        notes: z.string().optional(),
        is_estimate: z
          .boolean()
          .optional()
          .describe("true si les macros sont une estimation (log libre estimé)"),
      },
      jsonTool((args) => svc.logMeal(args))
    );

    server.tool(
      "update_meal_log",
      "Modifie un log de repas existant (slot, date, portion, macros, notes).",
      {
        id: z.string(),
        slot: slot.optional(),
        log_date: date.optional(),
        portion_factor: z.number().optional(),
        kcal: z.number().optional(),
        protein_g: z.number().optional(),
        carbs_g: z.number().optional(),
        fat_g: z.number().optional(),
        notes: z.string().optional(),
      },
      jsonTool(({ id, ...fields }) => svc.updateMealLog(id, fields))
    );

    server.tool(
      "delete_meal_log",
      "Supprime un log de repas.",
      { id: z.string() },
      jsonTool(({ id }) => svc.deleteMealLog(id))
    );

    server.tool(
      "log_workout",
      "Logge une séance. Muscu : exercises[{name, sets[{reps, weight_kg}]}] — exos matchés/créés dans le catalogue (poids négatif = assistance, null = poids du corps, haltères = poids par haltère). Running : distance_km, run_type, duration_min (pace calculé).",
      {
        date: date.optional(),
        type: z.enum(["muscu", "running", "padel", "autre"]),
        template_name: z.string().optional(),
        exercises: z
          .array(
            z.object({
              name: z.string(),
              sets: z.array(
                z.object({
                  reps: z.number().optional(),
                  weight_kg: z.number().nullable().optional(),
                  duration_s: z.number().optional(),
                  distance_m: z.number().optional(),
                })
              ),
            })
          )
          .optional(),
        distance_km: z.number().optional(),
        run_type: z.enum(["normal", "intervalles", "fractionné", "long", "récup"]).optional(),
        duration_min: z.number().optional(),
        perceived_intensity: z.number().min(1).max(10).optional(),
        notes: z.string().optional(),
      },
      jsonTool((args) => svc.logWorkout(args))
    );

    server.tool(
      "get_workouts",
      "Séances (avec séries et noms d'exercices) sur une période.",
      { start_date: date, end_date: date },
      jsonTool(({ start_date, end_date }) => svc.getWorkouts(start_date, end_date))
    );

    server.tool(
      "get_exercise_history",
      "Historique des séries d'un exercice (analyse de progression). Match partiel sur le nom.",
      { exercise_name: z.string(), limit: z.number().optional() },
      jsonTool(({ exercise_name, limit }) => svc.getExerciseHistory(exercise_name, limit))
    );

    server.tool(
      "log_body_metric",
      "Enregistre poids et/ou tour de taille (upsert par date).",
      { date: date.optional(), weight_kg: z.number().optional(), waist_cm: z.number().optional() },
      jsonTool((args) => svc.logBodyMetric(args))
    );

    // ---------- Phase 6 : planificateur ----------
    server.tool(
      "get_plan",
      "Plan de repas sur une période : entrées par jour, totaux macros/jour, deltas vs cibles (±5%), compteurs Alan de la période.",
      { start_date: date, end_date: date },
      jsonTool(({ start_date, end_date }) => svc.getPlan(start_date, end_date))
    );

    server.tool(
      "plan_meal",
      "Planifie UNE recette sur un jour+slot. Un seul plat par slot : re-planifier le même jour+slot REMPLACE l'entrée existante.",
      {
        date,
        slot,
        recipe_code: z.string(),
        portion_factor: z.number().optional(),
      },
      jsonTool((args) => svc.planMealMcp(args))
    );

    server.tool(
      "plan_week",
      "Écrit un plan en LOT ATOMIQUE (tout ou rien) : si un recipe_code est inconnu ou le lot invalide, rien n'est écrit. Upsert par jour+slot (remplace). Renvoie le plan résultant avec totaux et compteurs Alan. C'est LE tool pour composer une semaine en conversation.",
      {
        entries: z
          .array(
            z.object({
              date,
              slot,
              recipe_code: z.string(),
              portion_factor: z.number().optional(),
            })
          )
          .min(1),
      },
      jsonTool(({ entries }) => svc.planWeek(entries))
    );

    server.tool(
      "clear_plan",
      "Supprime les entrées de plan d'une période (optionnellement un seul slot).",
      { start_date: date, end_date: date, slot: slot.optional() },
      jsonTool(({ start_date, end_date, slot }) => svc.clearPlan(start_date, end_date, slot))
    );

    server.tool(
      "get_shopping_list",
      "Liste de courses agrégée du plan sur une période : quantités × portions sommées par (item, unité), sans conversion d'unités, groupées par rayon. Renvoie aussi la version texte copiable.",
      { start_date: date, end_date: date },
      jsonTool(({ start_date, end_date }) => svc.getShoppingListMcp(start_date, end_date))
    );

    // ---------- Lot 7 : couverture complète ----------
    const templateExercise = z.object({
      name: z.string().describe("Nom d'exercice (matché/créé dans le catalogue)"),
      sets: z.number().optional(),
      reps_min: z.number().optional(),
      reps_max: z.number().optional(),
      target_rpe: z.number().optional(),
      rest_seconds: z.number().optional(),
      note: z
        .string()
        .optional()
        .describe("Note catalogue (convention de poids), appliquée si l'exo est créé"),
    });
    const workoutExercises = z
      .array(
        z.object({
          name: z.string(),
          sets: z.array(
            z.object({
              reps: z.number().optional(),
              weight_kg: z.number().nullable().optional(),
              duration_s: z.number().optional(),
              distance_m: z.number().optional(),
            })
          ),
        })
      )
      .min(1);

    server.tool(
      "list_workout_templates",
      "Templates de séances avec leurs exercices (fourchette reps, RPE, repos). Les templates archivés sont exclus sauf include_archived=true.",
      { include_archived: z.boolean().optional() },
      jsonTool(({ include_archived }) => svc.listWorkoutTemplates(include_archived ?? false))
    );

    server.tool(
      "create_workout_template",
      "Crée un template de séance : exercices ordonnés (l'ordre du tableau = position), matchés/créés dans le catalogue.",
      {
        name: z.string(),
        type: z.enum(["muscu", "running", "padel", "autre"]).optional(),
        exercises: z.array(templateExercise).min(1),
      },
      jsonTool((args) => svc.createWorkoutTemplate(args))
    );

    server.tool(
      "update_workout_template",
      "Modifie un template : nom, type, archivage (is_active=false), et/ou REMPLACEMENT COMPLET de la liste d'exercices. Ne réécrit jamais les séances passées.",
      {
        id: z.string(),
        name: z.string().optional(),
        type: z.enum(["muscu", "running", "padel", "autre"]).optional(),
        is_active: z.boolean().optional(),
        exercises: z.array(templateExercise).min(1).optional(),
      },
      jsonTool((args) => svc.updateWorkoutTemplate(args))
    );

    server.tool(
      "create_exercise",
      "Ajoute un exercice au catalogue (erreur s'il existe déjà, insensible à la casse).",
      {
        name: z.string(),
        muscle_group: z.string().optional(),
        measure_type: z.enum(["reps", "duration", "distance"]).optional(),
        note: z.string().optional().describe("Convention de poids (par haltère, assistance…)"),
      },
      jsonTool((args) => svc.createExercise(args))
    );

    server.tool(
      "update_exercise",
      "Modifie un exercice du catalogue (renommer conserve tout l'historique des séries).",
      {
        id: z.string(),
        name: z.string().optional(),
        muscle_group: z.string().optional(),
        measure_type: z.enum(["reps", "duration", "distance"]).optional(),
        note: z.string().optional(),
      },
      jsonTool(({ id, ...fields }) => svc.updateExercise(id, fields))
    );

    server.tool(
      "update_workout",
      "Modifie une séance : champs simples et/ou REMPLACEMENT COMPLET des séries (exercises). Les baselines seedés sont protégés.",
      {
        id: z.string(),
        date: date.optional(),
        duration_min: z.number().optional(),
        distance_km: z.number().optional(),
        run_type: z.enum(["normal", "intervalles", "fractionné", "long", "récup"]).optional(),
        perceived_intensity: z.number().min(1).max(10).optional(),
        notes: z.string().optional(),
        exercises: workoutExercises.optional(),
      },
      jsonTool((args) => svc.updateWorkout(args))
    );

    server.tool(
      "delete_workout",
      "Supprime une séance et ses séries. Refuse les baselines seedés (poids de départ).",
      { id: z.string() },
      jsonTool(({ id }) => svc.deleteWorkout(id))
    );

    server.tool(
      "get_body_metrics",
      "Pesées et tours de taille bruts sur une période.",
      { start_date: date, end_date: date },
      jsonTool(({ start_date, end_date }) => svc.getBodyMetrics(start_date, end_date))
    );

    server.tool(
      "delete_body_metric",
      "Supprime la pesée d'une date (erreur si aucune pesée ce jour-là).",
      { date },
      jsonTool(({ date }) => svc.deleteBodyMetric(date))
    );
  },
  {
    serverInfo: { name: "gym-buddy", version: "1.0.0" },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
  }
);

// Auth : MCP_SECRET statique (trade-off v1 assumé par le PO — pas d'OAuth),
// accepté sur DEUX canaux (décision PO, FLAG 10) :
//  - header `Authorization: Bearer <secret>` (tests, clients avec headers)
//  - query `?key=<secret>` — canal ADDITIONNEL requis par l'UI des
//    connecteurs Claude.ai, qui n'offre aucun champ bearer statique.
// Comparaison à temps constant sur les deux canaux ; le secret n'est
// jamais loggé par l'application.
function safeEqual(candidate: string, secret: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyToken(req: Request, bearerToken?: string) {
  const secret = process.env.MCP_SECRET;
  if (!secret) return undefined;
  const key = new URL(req.url).searchParams.get("key");
  const ok =
    (bearerToken != null && safeEqual(bearerToken, secret)) ||
    (key != null && safeEqual(key, secret));
  if (!ok) return undefined;
  return { token: "ok", clientId: "gym-buddy-owner", scopes: [] as string[] };
}

const authedHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
