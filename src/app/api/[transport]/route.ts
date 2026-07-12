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
      "Cibles journalières de Florian (kcal, protéines, glucides, lipides, fibres) + ses préférences alimentaires (food_preferences).",
      {},
      jsonTool(() => svc.getTargetsMcp())
    );

    server.tool(
      "get_food_preferences",
      "Préférences alimentaires (goûts/aversions) par personne. person optionnel : 'florian' ou 'sarah' pour filtrer, sinon toutes. À consulter AVANT de planifier des repas pour ne jamais proposer un aliment rejeté.",
      { person: z.string().optional().describe("'florian' | 'sarah' (filtre optionnel)") },
      jsonTool(({ person }) => svc.getFoodPreferences(person))
    );

    server.tool(
      "add_food_preference",
      "Ajoute une préférence alimentaire (label libre). kind: dislike | allergy | preference.",
      {
        person: z.string().describe("'florian' | 'sarah'"),
        kind: z.enum(["dislike", "allergy", "preference"]),
        label: z.string().describe("Ex. 'poisson blanc', 'thon', 'beans', 'végétarien le midi'"),
        notes: z.string().optional(),
      },
      jsonTool((args) => svc.addFoodPreference(args))
    );

    server.tool(
      "delete_food_preference",
      "Supprime une préférence alimentaire par id.",
      { id: z.string() },
      jsonTool(({ id }) => svc.deleteFoodPreference(id))
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
      "get_partner_profile",
      "Profil partenaire (mode couple) : cibles macros de Sarah + is_active. Sarah est un profil de macros, pas un compte.",
      {},
      jsonTool(() => svc.getPartnerProfile())
    );

    server.tool(
      "update_partner_profile",
      "Met à jour le profil partenaire (nom, cibles macros, activation du mode couple). Champs partiels.",
      {
        name: z.string().optional(),
        kcal: z.number().optional(),
        protein_g: z.number().optional(),
        carbs_g: z.number().optional(),
        fat_g: z.number().optional(),
        is_active: z.boolean().optional().describe("Active/désactive le mode couple globalement."),
      },
      jsonTool((args) => svc.updatePartnerProfile(args))
    );

    server.tool(
      "get_day",
      "Journée complète : logs repas (part PO + part Sarah dérivée si repas pour deux), totaux, delta vs cibles, séances, pesée, bloc partenaire.",
      { date },
      jsonTool(({ date }) => svc.getDay(date))
    );

    server.tool(
      "get_summary",
      "Résumé d'une période : moyennes kcal/macros des jours loggés, poids (brut + moyenne hebdo), séances par type, nombre de repas au poisson gras (oily_fish_count).",
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
      "Ajoute une recette (source='claude'). Ingrédients quantifiés obligatoires. code optionnel (erreur s'il est déjà pris) — non requis : la recette reste planifiable/loggable par recipe_id.",
      {
        name: z.string(),
        category,
        code: z.string().optional().describe("Code lisible optionnel (ex. L8) — unique"),
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
      "Modifie une recette existante (champs partiels). Ne réécrit jamais les logs passés. code optionnel : attribue/modifie le code (unique ; \"\" le retire).",
      {
        id: z.string().describe("uuid de la recette"),
        name: z.string().optional(),
        code: z.string().optional().describe("Attribue/modifie le code lisible (unique)"),
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
      "Logge un repas : recipe_code OU recipe_id (macros = recette × portion, figées) OU free_label + macros manuelles (kcal obligatoire). date par défaut : aujourd'hui (Bruxelles).",
      {
        date: date.optional(),
        slot,
        recipe_code: z.string().optional(),
        recipe_id: z.string().optional().describe("uuid de recette (alternative au code, ex. recettes sans code)"),
        portion_factor: z.number().optional(),
        for_two: z
          .boolean()
          .optional()
          .describe("Mode couple : repas partagé avec Sarah. Les macros stockées = part du PO uniquement."),
        po_share: z
          .number()
          .optional()
          .describe("Part du PO si for_two (strictement entre 0 et 1, ex. 0.5 = moitié-moitié). La part de Sarah est dérivée, jamais stockée."),
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
      "Logge une séance. Muscu : exercises[{name, sets[{reps, weight_kg, rpe?}]}] — exos matchés/créés dans le catalogue (poids négatif = assistance, null = poids du corps, haltères = poids par haltère ; rpe = effort perçu 1-10 optionnel, à comparer au target_rpe du template). Running : distance_km, run_type, duration_min (pace calculé).",
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
                  rpe: z
                    .number()
                    .min(1)
                    .max(10)
                    .nullable()
                    .optional()
                    .describe("Effort perçu 1-10 (demi-points ok), optionnel — à comparer au target_rpe."),
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
      "Plan de repas sur une période : entrées par jour, totaux macros/jour, deltas vs cibles (±5%), nombre d'entrées au poisson gras (oily_fish_count).",
      { start_date: date, end_date: date },
      jsonTool(({ start_date, end_date }) => svc.getPlan(start_date, end_date))
    );

    server.tool(
      "plan_meal",
      "Planifie UNE recette sur un jour+slot, par recipe_code OU recipe_id (au moins l'un). Un seul plat par slot : re-planifier le même jour+slot REMPLACE l'entrée existante.",
      {
        date,
        slot,
        recipe_code: z.string().optional(),
        recipe_id: z.string().optional().describe("uuid de recette (alternative au code)"),
        portion_factor: z.number().optional(),
        for_two: z
          .boolean()
          .optional()
          .describe("Mode couple : repas partagé avec Sarah (total_portion fait alors autorité)."),
        po_share: z
          .number()
          .optional()
          .describe("Part du PO si for_two (strictement entre 0 et 1)."),
        total_portion: z
          .number()
          .optional()
          .describe("Portions totales cuisinées si for_two (PO + Sarah). Défaut 1."),
      },
      jsonTool((args) => svc.planMealMcp(args))
    );

    server.tool(
      "plan_week",
      "Écrit un plan en LOT ATOMIQUE (tout ou rien) : chaque entrée référence une recette par recipe_code OU recipe_id (au moins l'un). Si une référence est inconnue ou le lot invalide, rien n'est écrit. Upsert par jour+slot (remplace). Renvoie le plan résultant avec totaux et oily_fish_count. C'est LE tool pour composer une semaine en conversation.",
      {
        entries: z
          .array(
            z.object({
              date,
              slot,
              recipe_code: z.string().optional(),
              recipe_id: z.string().optional().describe("uuid de recette (alternative au code)"),
              portion_factor: z.number().optional(),
              for_two: z.boolean().optional().describe("Mode couple (total_portion fait autorité)."),
              po_share: z.number().optional().describe("Part du PO si for_two (0 < po_share < 1)."),
              total_portion: z.number().optional().describe("Portions totales si for_two (PO + Sarah)."),
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
        .describe("Note de LIGNE, contexte de séance (superset, tempo…)"),
      catalog_note: z
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
              rpe: z.number().min(1).max(10).nullable().optional().describe("Effort perçu 1-10, optionnel"),
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
      "list_exercises",
      "Catalogue d'exercices (nom, groupe musculaire, note). À consulter AVANT de matcher des noms dans log_workout ou les templates, pour éviter les quasi-doublons qui fragmenteraient l'historique des charges.",
      { query: z.string().optional().describe("Filtre partiel sur le nom") },
      jsonTool(({ query }) => svc.listExercises(query))
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
      "set_exercise_target",
      "Pose/met à jour/efface la CIBLE de poids d'un exercice (prochain poids à viser, affiché en séance à côté du dernier poids fait). Match par nom sur le catalogue. target_weight_kg=null efface la cible. À poser après chaque séance selon la progression réelle (double progression : haut de fourchette atteint + RPE ≤ cible → +2,5 kg).",
      {
        exercise_name: z.string().describe("Nom de l'exercice (match sur le catalogue)"),
        target_weight_kg: z
          .number()
          .nullable()
          .describe("Poids cible en kg (> 0), ou null pour effacer la cible"),
        target_weight_note: z
          .string()
          .optional()
          .describe("Courte justification, ex. '+2.5kg, tu tapais le haut de fourchette'"),
      },
      jsonTool((args) => svc.setExerciseTarget(args))
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
