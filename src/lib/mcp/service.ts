import "server-only";
import { mcpDb } from "./db";
import { brusselsDay, isIsoDate, shiftDay } from "@/lib/brussels-day.mjs";
import { roundMacro } from "@/lib/today";
import { oilyFishCount } from "@/lib/oily-fish.mjs";

// ============================================================
// Logique métier des 14 tools MCP (PRD §5).
// Mêmes règles que l'app : macros dénormalisées à l'insertion,
// jour local Europe/Brussels, historique jamais réécrit.
// ============================================================

const SLOTS = ["petit_dej", "dejeuner", "collation", "diner", "extra"];
const WORKOUT_TYPES = ["muscu", "running", "padel", "autre"];
// Workouts seedés pour le pré-remplissage des poids : exclus des stats
// (get_day, get_summary, get_workouts) mais conservés dans
// get_exercise_history — c'est leur raison d'être (décision PO, lot 2.1).
const BASELINE_NOTE = "baseline seed — poids de départ";
const notBaseline = <T extends { notes?: string | null }>(rows: T[]) =>
  rows.filter((w) => w.notes !== BASELINE_NOTE);

function fail(message: string): never {
  throw new Error(message);
}

function assertDate(d: string, label = "date"): string {
  if (!isIsoDate(d)) fail(`${label} invalide (attendu YYYY-MM-DD) : ${d}`);
  return d;
}

// ---------- targets ----------
export async function getTargets() {
  const { data, error } = await mcpDb().from("targets").select("*").eq("id", 1).single();
  if (error) fail(error.message);
  return data;
}

export async function updateTargets(patch: {
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
}) {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v != null && Number.isFinite(Number(v)) && Number(v) > 0)
  );
  if (Object.keys(clean).length === 0) fail("Aucun champ de cible valide fourni.");
  const { data, error } = await mcpDb()
    .from("targets")
    .update(clean)
    .eq("id", 1)
    .select()
    .single();
  if (error) fail(error.message);
  return data;
}

// ---------- day ----------
export async function getDay(date: string) {
  const d = assertDate(date);
  const db = mcpDb();
  const [logs, workouts, metric, targets] = await Promise.all([
    db
      .from("meal_logs")
      .select("*, recipe:recipes(name, code)")
      .eq("log_date", d)
      .order("created_at"),
    db
      .from("workouts")
      .select("*, workout_sets(position, set_number, reps, weight_kg, duration_s, distance_m, exercise:exercises(name))")
      .eq("workout_date", d),
    db.from("body_metrics").select("*").eq("metric_date", d).maybeSingle(),
    getTargets(),
  ]);
  if (logs.error) fail(logs.error.message);
  if (workouts.error) fail(workouts.error.message);

  const totals = (logs.data ?? []).reduce(
    (a, l) => ({
      kcal: a.kcal + l.kcal,
      protein_g: roundMacro(a.protein_g + Number(l.protein_g)),
      carbs_g: roundMacro(a.carbs_g + Number(l.carbs_g)),
      fat_g: roundMacro(a.fat_g + Number(l.fat_g)),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return {
    date: d,
    targets,
    totals,
    delta_vs_targets: {
      kcal: totals.kcal - targets.kcal,
      protein_g: roundMacro(totals.protein_g - targets.protein_g),
      carbs_g: roundMacro(totals.carbs_g - targets.carbs_g),
      fat_g: roundMacro(totals.fat_g - targets.fat_g),
    },
    meal_logs: logs.data,
    workouts: notBaseline(workouts.data ?? []),
    body_metric: metric.data ?? null,
  };
}

// ---------- summary ----------
export async function getSummary(startDate: string, endDate: string) {
  const start = assertDate(startDate, "start_date");
  const end = assertDate(endDate, "end_date");
  if (start > end) fail("start_date doit précéder end_date.");
  const db = mcpDb();

  const [logs, metrics, workouts, targets] = await Promise.all([
    db
      .from("meal_logs")
      .select("log_date, kcal, protein_g, carbs_g, fat_g, recipe:recipes(tags)")
      .gte("log_date", start)
      .lte("log_date", end),
    db
      .from("body_metrics")
      .select("metric_date, weight_kg, waist_cm")
      .gte("metric_date", start)
      .lte("metric_date", end)
      .order("metric_date"),
    db
      .from("workouts")
      .select("workout_date, type, notes")
      .gte("workout_date", start)
      .lte("workout_date", end),
    getTargets(),
  ]);
  if (logs.error) fail(logs.error.message);

  // Moyennes sur les jours effectivement loggés
  const byDay = new Map<string, { kcal: number; p: number; g: number; l: number }>();
  for (const l of logs.data ?? []) {
    const d = byDay.get(l.log_date) ?? { kcal: 0, p: 0, g: 0, l: 0 };
    d.kcal += l.kcal;
    d.p += Number(l.protein_g);
    d.g += Number(l.carbs_g);
    d.l += Number(l.fat_g);
    byDay.set(l.log_date, d);
  }
  // Lot 8 : seul le poisson gras est suivi (les compteurs Alan sont retirés)
  const oily_fish_count = oilyFishCount(
    (logs.data ?? []).map((l) => ({
      tags: (l.recipe as unknown as { tags: string[] | null } | null)?.tags ?? null,
    }))
  );
  const daysLogged = byDay.size;
  const avg = (sel: (d: { kcal: number; p: number; g: number; l: number }) => number) =>
    daysLogged === 0
      ? null
      : Math.round(([...byDay.values()].reduce((s, d) => s + sel(d), 0) / daysLogged) * 10) / 10;

  // Poids : brut + moyenne par semaine ISO (lundi comme clé)
  const mondayOf = (iso: string) => {
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=dim
    return shiftDay(iso, dow === 0 ? -6 : 1 - dow);
  };
  const weeks = new Map<string, number[]>();
  for (const m of metrics.data ?? []) {
    if (m.weight_kg == null) continue;
    const wk = mondayOf(m.metric_date);
    weeks.set(wk, [...(weeks.get(wk) ?? []), Number(m.weight_kg)]);
  }
  const weeklyWeight = [...weeks.entries()]
    .sort()
    .map(([week_start, vals]) => ({
      week_start,
      avg_weight_kg: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100,
      measurements: vals.length,
    }));

  const workoutsByType: Record<string, number> = {};
  for (const w of notBaseline(workouts.data ?? []))
    workoutsByType[w.type] = (workoutsByType[w.type] ?? 0) + 1;

  return {
    start_date: start,
    end_date: end,
    targets,
    days_logged: daysLogged,
    daily_averages: {
      kcal: avg((d) => d.kcal),
      protein_g: avg((d) => d.p),
      carbs_g: avg((d) => d.g),
      fat_g: avg((d) => d.l),
    },
    weight: { raw: metrics.data ?? [], weekly_average: weeklyWeight },
    workouts_by_type: workoutsByType,
    oily_fish_count,
  };
}

// ---------- recipes ----------
export async function searchRecipes(params: {
  query?: string;
  category?: string;
  tags?: string[];
}) {
  let q = mcpDb()
    .from("recipes")
    .select("id, code, name, category, kcal, protein_g, carbs_g, fat_g, fiber_g, prep_min, tags, ingredients, source")
    .eq("is_active", true)
    .order("name");
  if (params.category) q = q.eq("category", params.category);
  if (params.tags?.length) q = q.contains("tags", params.tags);
  if (params.query?.trim()) q = q.ilike("name", `%${params.query.trim()}%`);
  const { data, error } = await q;
  if (error) fail(error.message);
  return { count: (data ?? []).length, recipes: data };
}

type RecipeInput = {
  name: string;
  category: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  ingredients: { item: string; qty: number; unit: string; note?: string }[];
  steps?: string[];
  prep_min?: number;
  tags?: string[];
};

/** Vérifie qu'un code n'est pas déjà pris (lot 9). exceptId = recette éditée. */
async function assertCodeAvailable(code: string, exceptId?: string) {
  let q = mcpDb().from("recipes").select("id, name").eq("code", code);
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q.maybeSingle();
  if (error) fail(error.message);
  if (data) fail(`Le code "${code}" est déjà attribué à une autre recette ("${data.name}").`);
}

export async function addRecipe(input: RecipeInput & { code?: string }) {
  if (!input.ingredients?.length) fail("ingredients est obligatoire (au moins 1).");
  const { code, ...rest } = input;
  const trimmedCode = code?.trim();
  if (trimmedCode) await assertCodeAvailable(trimmedCode); // lot 9 : code optionnel, unique
  const { data, error } = await mcpDb()
    .from("recipes")
    .insert({ ...rest, ...(trimmedCode ? { code: trimmedCode } : {}), source: "claude" })
    .select()
    .single();
  if (error) fail(error.message);
  return data;
}

export async function updateRecipe(
  id: string,
  fields: Partial<RecipeInput> & { is_active?: boolean; code?: string }
) {
  const allowed = [
    "name", "category", "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g",
    "ingredients", "steps", "prep_min", "tags", "is_active", "code",
  ];
  const patch = Object.fromEntries(
    Object.entries(fields).filter(([k, v]) => allowed.includes(k) && v !== undefined)
  );
  if (Object.keys(patch).length === 0) fail("Aucun champ à modifier.");
  if (typeof patch.code === "string") {
    // lot 9 : attribuer/modifier le code d'une recette, unicité vérifiée
    patch.code = patch.code.trim();
    if (patch.code) await assertCodeAvailable(patch.code, id);
    else patch.code = null as unknown as string; // "" → retire le code
  }
  const { data, error } = await mcpDb()
    .from("recipes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) fail(error.message);
  return data;
}

// ---------- résolution de recette par code OU id (lot 9) ----------
// add_recipe crée des recettes SANS code : le recipe_id devient donc un
// identifiant de plein droit pour planifier/logguer. Au moins l'un des
// deux requis ; si les deux fournis et incohérents → erreur métier.
type RecipeRef = { recipe_code?: string; recipe_id?: string };

async function resolveRecipeRef(
  ref: RecipeRef,
  cols = "id, code, kcal, protein_g, carbs_g, fat_g"
) {
  const db = mcpDb();
  if (ref.recipe_id) {
    const { data, error } = await db.from("recipes").select(cols).eq("id", ref.recipe_id).maybeSingle();
    if (error) fail(error.message);
    if (!data) fail(`Recette introuvable pour recipe_id "${ref.recipe_id}".`);
    const row = data as unknown as { code: string | null };
    if (ref.recipe_code && row.code !== ref.recipe_code)
      fail(
        `Incohérence : recipe_id "${ref.recipe_id}" porte le code "${row.code ?? "(aucun)"}", pas "${ref.recipe_code}".`
      );
    return data;
  }
  if (ref.recipe_code) {
    const { data, error } = await db.from("recipes").select(cols).eq("code", ref.recipe_code).maybeSingle();
    if (error) fail(error.message);
    if (!data) fail(`Recette introuvable pour le code "${ref.recipe_code}" (utilise search_recipes).`);
    return data;
  }
  fail("recipe_code ou recipe_id requis.");
}

// ---------- meal logs ----------
export async function logMeal(input: {
  date?: string;
  slot: string;
  recipe_code?: string;
  recipe_id?: string;
  portion_factor?: number;
  free_label?: string;
  macros?: { kcal: number; protein_g?: number; carbs_g?: number; fat_g?: number };
  notes?: string;
  is_estimate?: boolean;
}) {
  const date = assertDate(input.date ?? brusselsDay());
  if (!SLOTS.includes(input.slot)) fail(`slot invalide (${SLOTS.join("|")}).`);
  const db = mcpDb();

  if (input.recipe_code || input.recipe_id) {
    const factor = input.portion_factor ?? 1;
    if (!(factor > 0 && factor <= 10)) fail("portion_factor invalide.");
    const recipe = (await resolveRecipeRef(input)) as unknown as {
      id: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
    };
    const { data, error: insErr } = await db
      .from("meal_logs")
      .insert({
        log_date: date,
        slot: input.slot,
        recipe_id: recipe.id,
        portion_factor: factor,
        kcal: Math.round(recipe.kcal * factor),
        protein_g: roundMacro(Number(recipe.protein_g) * factor),
        carbs_g: roundMacro(Number(recipe.carbs_g) * factor),
        fat_g: roundMacro(Number(recipe.fat_g) * factor),
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (insErr) fail(insErr.message);
    return data;
  }

  if (!input.free_label) fail("recipe_code ou free_label requis.");
  if (input.macros?.kcal == null) fail("macros.kcal est obligatoire pour un log libre.");
  const { data, error } = await db
    .from("meal_logs")
    .insert({
      log_date: date,
      slot: input.slot,
      free_label: input.free_label,
      portion_factor: 1,
      kcal: Math.round(input.macros.kcal),
      protein_g: roundMacro(input.macros.protein_g ?? 0),
      carbs_g: roundMacro(input.macros.carbs_g ?? 0),
      fat_g: roundMacro(input.macros.fat_g ?? 0),
      notes: input.notes ?? null,
      is_estimate: Boolean(input.is_estimate),
    })
    .select()
    .single();
  if (error) fail(error.message);
  return data;
}

export async function updateMealLog(
  id: string,
  fields: {
    slot?: string;
    log_date?: string;
    portion_factor?: number;
    kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    notes?: string;
  }
) {
  if (fields.slot && !SLOTS.includes(fields.slot)) fail("slot invalide.");
  if (fields.log_date) assertDate(fields.log_date, "log_date");
  const patch = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(patch).length === 0) fail("Aucun champ à modifier.");
  const { data, error } = await mcpDb()
    .from("meal_logs")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) fail(error.message);
  return data;
}

export async function deleteMealLog(id: string) {
  const { error, count } = await mcpDb()
    .from("meal_logs")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) fail(error.message);
  if (!count) fail(`Aucun meal_log avec l'id ${id}.`);
  return { deleted: true, id };
}

// ---------- workouts ----------
type WorkoutExerciseInput = {
  name: string;
  sets: { reps?: number; weight_kg?: number | null; duration_s?: number; distance_m?: number }[];
};

/**
 * Match par nom exact (insensible à la casse), création à la volée sinon.
 * `note` (convention de poids, AMENDEMENT 3) n'est appliquée qu'à la
 * création — jamais écrasée sur un exercice existant.
 */
async function matchOrCreateExercise(
  name: string,
  note?: string
): Promise<{ id: string; created: boolean }> {
  const db = mcpDb();
  const { data: found } = await db
    .from("exercises")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (found) return { id: found.id, created: false };
  const { data: created, error } = await db
    .from("exercises")
    .insert({ name, measure_type: "reps", note: note ?? null })
    .select("id")
    .single();
  if (error) fail(error.message);
  return { id: created.id, created: true };
}

async function buildSetRows(workoutId: string, exercises: WorkoutExerciseInput[]) {
  const created: string[] = [];
  const rows: object[] = [];
  for (const [pos, ex] of exercises.entries()) {
    const match = await matchOrCreateExercise(ex.name);
    if (match.created) created.push(ex.name);
    ex.sets.forEach((s, i) =>
      rows.push({
        workout_id: workoutId,
        exercise_id: match.id,
        position: pos + 1,
        set_number: i + 1,
        reps: s.reps ?? null,
        weight_kg: s.weight_kg ?? null,
        duration_s: s.duration_s ?? null,
        distance_m: s.distance_m ?? null,
      })
    );
  }
  return { rows, created };
}

export async function logWorkout(input: {
  date?: string;
  type: string;
  template_name?: string;
  exercises?: { name: string; sets: { reps?: number; weight_kg?: number | null; duration_s?: number; distance_m?: number }[] }[];
  distance_km?: number;
  run_type?: string;
  duration_min?: number;
  perceived_intensity?: number;
  notes?: string;
}) {
  const date = assertDate(input.date ?? brusselsDay());
  if (!WORKOUT_TYPES.includes(input.type)) fail(`type invalide (${WORKOUT_TYPES.join("|")}).`);
  const db = mcpDb();

  let template_id: string | null = null;
  if (input.template_name) {
    const { data } = await db
      .from("workout_templates")
      .select("id")
      .ilike("name", input.template_name)
      .maybeSingle();
    template_id = data?.id ?? null;
  }

  const { data: workout, error } = await db
    .from("workouts")
    .insert({
      workout_date: date,
      type: input.type,
      template_id,
      duration_min: input.duration_min ?? null,
      distance_km: input.distance_km ?? null,
      run_type: input.run_type ?? null,
      perceived_intensity: input.perceived_intensity ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) fail(error.message);

  const { rows: sets, created: createdExercises } = await buildSetRows(
    workout.id,
    input.exercises ?? []
  );
  if (sets.length) {
    const { error: sErr } = await db.from("workout_sets").insert(sets);
    if (sErr) fail(sErr.message);
  }

  return {
    workout,
    sets_created: sets.length,
    exercises_created: createdExercises,
    pace_min_per_km:
      input.distance_km && input.duration_min
        ? Math.round((input.duration_min / input.distance_km) * 100) / 100
        : null,
  };
}

export async function getWorkouts(startDate: string, endDate: string) {
  const start = assertDate(startDate, "start_date");
  const end = assertDate(endDate, "end_date");
  const { data, error } = await mcpDb()
    .from("workouts")
    .select("*, workout_sets(position, set_number, reps, weight_kg, duration_s, distance_m, exercise:exercises(name))")
    .gte("workout_date", start)
    .lte("workout_date", end)
    .order("workout_date");
  if (error) fail(error.message);
  const workouts = notBaseline(data ?? []);
  return { count: workouts.length, workouts };
}

export async function getExerciseHistory(exerciseName: string, limit = 10) {
  const db = mcpDb();
  const { data: exercise, error } = await db
    .from("exercises")
    .select("id, name, muscle_group, note")
    .ilike("name", `%${exerciseName}%`)
    .limit(1)
    .maybeSingle();
  if (error) fail(error.message);
  if (!exercise) fail(`Exercice introuvable : "${exerciseName}".`);

  const { data: sets, error: sErr } = await db
    .from("workout_sets")
    .select("set_number, reps, weight_kg, duration_s, distance_m, workout:workouts!inner(id, workout_date, notes)")
    .eq("exercise_id", exercise.id);
  if (sErr) fail(sErr.message);

  type Row = {
    set_number: number; reps: number | null; weight_kg: number | null;
    duration_s: number | null; distance_m: number | null;
    workout: { id: string; workout_date: string; notes: string | null };
  };
  const byWorkout = new Map<string, { workout_date: string; notes: string | null; sets: object[] }>();
  for (const s of (sets ?? []) as unknown as Row[]) {
    const w = byWorkout.get(s.workout.id) ?? {
      workout_date: s.workout.workout_date,
      notes: s.workout.notes,
      sets: [],
    };
    w.sets.push({ set_number: s.set_number, reps: s.reps, weight_kg: s.weight_kg });
    byWorkout.set(s.workout.id, w);
  }
  const history = [...byWorkout.values()]
    .sort((a, b) => (a.workout_date < b.workout_date ? 1 : -1))
    .slice(0, limit);

  return { exercise, workouts: history };
}

// ---------- body metrics ----------
export async function logBodyMetric(input: {
  date?: string;
  weight_kg?: number;
  waist_cm?: number;
}) {
  const date = assertDate(input.date ?? brusselsDay());
  if (input.weight_kg == null && input.waist_cm == null)
    fail("weight_kg ou waist_cm requis.");
  const { data, error } = await mcpDb()
    .from("body_metrics")
    .upsert(
      {
        metric_date: date,
        ...(input.weight_kg != null ? { weight_kg: input.weight_kg } : {}),
        ...(input.waist_cm != null ? { waist_cm: input.waist_cm } : {}),
      },
      { onConflict: "metric_date" }
    )
    .select()
    .single();
  if (error) fail(error.message);
  return data;
}

// ============================================================
// Phase 6 — Planificateur (5 tools additionnels)
// La génération de semaine est une CONVERSATION Claude (plan_week) :
// aucun solveur automatique dans l'app (non-goal explicite v2.1).
// ============================================================
import { aggregateShoppingList, shoppingListAsText } from "@/lib/shopping-list.mjs";

const PLAN_RECIPE_COLS =
  "id, code, name, kcal, protein_g, carbs_g, fat_g, tags, ingredients";

type PlanRow = {
  id: string;
  plan_date: string;
  slot: string;
  portion_factor: number | string;
  recipe: {
    id: string; code: string | null; name: string; kcal: number;
    protein_g: number; carbs_g: number; fat_g: number;
    tags: string[] | null;
    ingredients: { item: string; qty: number; unit: string }[];
  } | null;
};

async function fetchPlanRows(start: string, end: string): Promise<PlanRow[]> {
  const { data, error } = await mcpDb()
    .from("meal_plan_entries")
    .select(`id, plan_date, slot, portion_factor, recipe:recipes(${PLAN_RECIPE_COLS})`)
    .gte("plan_date", start)
    .lte("plan_date", end)
    .order("plan_date");
  if (error) fail(error.message);
  return (data ?? []) as unknown as PlanRow[];
}

function planDays(rows: PlanRow[], targets: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }) {
  const byDay = new Map<string, PlanRow[]>();
  for (const r of rows) byDay.set(r.plan_date, [...(byDay.get(r.plan_date) ?? []), r]);
  return [...byDay.entries()].map(([date, entries]) => {
    const totals = entries.reduce(
      (a, e) => {
        const f = Number(e.portion_factor) || 1;
        return {
          kcal: a.kcal + Math.round((e.recipe?.kcal ?? 0) * f),
          protein_g: roundMacro(a.protein_g + Number(e.recipe?.protein_g ?? 0) * f),
          carbs_g: roundMacro(a.carbs_g + Number(e.recipe?.carbs_g ?? 0) * f),
          fat_g: roundMacro(a.fat_g + Number(e.recipe?.fat_g ?? 0) * f),
        };
      },
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    return {
      date,
      entries: entries.map((e) => ({
        id: e.id,
        slot: e.slot,
        portion_factor: Number(e.portion_factor),
        recipe_id: e.recipe?.id ?? null,
        recipe_code: e.recipe?.code ?? null,
        recipe_name: e.recipe?.name ?? null,
      })),
      totals,
      delta_vs_targets: {
        kcal: totals.kcal - targets.kcal,
        protein_g: roundMacro(totals.protein_g - targets.protein_g),
        carbs_g: roundMacro(totals.carbs_g - targets.carbs_g),
        fat_g: roundMacro(totals.fat_g - targets.fat_g),
      },
      within_5pct_kcal: Math.abs(totals.kcal - targets.kcal) <= targets.kcal * 0.05,
    };
  });
}

export async function getPlan(startDate: string, endDate: string) {
  const start = assertDate(startDate, "start_date");
  const end = assertDate(endDate, "end_date");
  const [rows, targets] = await Promise.all([fetchPlanRows(start, end), getTargets()]);
  return {
    start_date: start,
    end_date: end,
    targets,
    days: planDays(rows, targets),
    oily_fish_count: oilyFishCount(rows.map((r) => ({ tags: r.recipe?.tags ?? null }))),
  };
}

export async function planMealMcp(input: {
  date: string;
  slot: string;
  recipe_code?: string;
  recipe_id?: string;
  portion_factor?: number;
}) {
  const date = assertDate(input.date);
  if (!SLOTS.includes(input.slot)) fail(`slot invalide (${SLOTS.join("|")}).`);
  const factor = input.portion_factor ?? 1;
  if (!(factor > 0 && factor <= 10)) fail("portion_factor invalide.");
  const recipe = (await resolveRecipeRef(input, "id")) as unknown as { id: string };
  const { data, error } = await mcpDb()
    .from("meal_plan_entries")
    .upsert(
      { plan_date: date, slot: input.slot, recipe_id: recipe.id, portion_factor: factor },
      { onConflict: "plan_date,slot" }
    )
    .select(`id, plan_date, slot, portion_factor, recipe:recipes(id, code, name)`)
    .single();
  if (error) fail(error.message);
  return data;
}

/**
 * Écriture d'une semaine en LOT ATOMIQUE : toutes les validations
 * (dates, slots, recettes par code OU id, doublons date+slot) passent
 * AVANT la moindre écriture ; l'upsert est un unique statement — tout ou
 * rien. Un recipe_id inconnu invalide le lot exactement comme un code.
 */
export async function planWeek(
  entries: {
    date: string;
    slot: string;
    recipe_code?: string;
    recipe_id?: string;
    portion_factor?: number;
  }[]
) {
  if (!entries?.length) fail("entries est vide.");
  const seen = new Set<string>();
  for (const e of entries) {
    assertDate(e.date);
    if (!SLOTS.includes(e.slot)) fail(`slot invalide : ${e.slot}`);
    if (!e.recipe_code && !e.recipe_id)
      fail(`Entrée sans recipe_code ni recipe_id : ${e.date} / ${e.slot}.`);
    if (e.portion_factor != null && !(e.portion_factor > 0 && e.portion_factor <= 10))
      fail(`portion_factor invalide pour ${e.date}/${e.slot}.`);
    const key = `${e.date}|${e.slot}`;
    if (seen.has(key)) fail(`Doublon dans le lot : ${e.date} / ${e.slot}.`);
    seen.add(key);
  }
  // Résolution de TOUTES les références (code et/ou id) avant écriture.
  const codes = [...new Set(entries.filter((e) => !e.recipe_id && e.recipe_code).map((e) => e.recipe_code!))];
  const ids = [...new Set(entries.map((e) => e.recipe_id).filter((v): v is string => Boolean(v)))];
  const db = mcpDb();
  const [byCodeRes, byIdRes] = await Promise.all([
    codes.length ? db.from("recipes").select("id, code").in("code", codes) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from("recipes").select("id, code").in("id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (byCodeRes.error) fail(byCodeRes.error.message);
  if (byIdRes.error) fail(byIdRes.error.message);
  const byCode = new Map((byCodeRes.data ?? []).map((r) => [r.code, r]));
  const byId = new Map((byIdRes.data ?? []).map((r) => [r.id, r]));

  const missing: string[] = [];
  const resolvedIds = entries.map((e) => {
    if (e.recipe_id) {
      const row = byId.get(e.recipe_id);
      if (!row) { missing.push(`id:${e.recipe_id}`); return null; }
      if (e.recipe_code && row.code !== e.recipe_code)
        fail(
          `Incohérence pour ${e.date}/${e.slot} : recipe_id porte le code "${row.code ?? "(aucun)"}", pas "${e.recipe_code}".`
        );
      return row.id;
    }
    const row = byCode.get(e.recipe_code!);
    if (!row) { missing.push(`code:${e.recipe_code}`); return null; }
    return row.id;
  });
  if (missing.length)
    fail(`Recettes inconnues : ${[...new Set(missing)].join(", ")} — rien n'a été écrit.`);

  const rows = entries.map((e, i) => ({
    plan_date: e.date,
    slot: e.slot,
    recipe_id: resolvedIds[i]!,
    portion_factor: e.portion_factor ?? 1,
  }));
  const { error: upErr } = await mcpDb()
    .from("meal_plan_entries")
    .upsert(rows, { onConflict: "plan_date,slot" });
  if (upErr) fail(upErr.message);

  const dates = entries.map((e) => e.date).sort();
  return getPlan(dates[0], dates[dates.length - 1]);
}

export async function clearPlan(startDate: string, endDate: string, slot?: string) {
  const start = assertDate(startDate, "start_date");
  const end = assertDate(endDate, "end_date");
  if (slot && !SLOTS.includes(slot)) fail("slot invalide.");
  let q = mcpDb()
    .from("meal_plan_entries")
    .delete({ count: "exact" })
    .gte("plan_date", start)
    .lte("plan_date", end);
  if (slot) q = q.eq("slot", slot);
  const { error, count } = await q;
  if (error) fail(error.message);
  return { deleted: count ?? 0, start_date: start, end_date: end, slot: slot ?? null };
}

export async function getShoppingListMcp(startDate: string, endDate: string) {
  const start = assertDate(startDate, "start_date");
  const end = assertDate(endDate, "end_date");
  const rows = await fetchPlanRows(start, end);
  const items = aggregateShoppingList(rows);
  return {
    start_date: start,
    end_date: end,
    entries_count: rows.length,
    items,
    text: shoppingListAsText(items),
  };
}

// ============================================================
// Lot 7 — couverture MCP complète (templates, exercices,
// workouts, mesures). Règle intangible : modifier un template ne
// réécrit JAMAIS un workout passé (les sets référencent les
// exercices directement, pas le template).
// ============================================================

type TemplateExerciseInput = {
  name: string;
  sets?: number;
  reps_min?: number;
  reps_max?: number;
  target_rpe?: number;
  rest_seconds?: number;
  /** Note de LIGNE (contexte de séance : superset, tempo…) — arbitrage PO lot 7. */
  note?: string;
  /** Note CATALOGUE (convention de poids) — appliquée seulement si l'exo est créé. */
  catalog_note?: string;
};

const TEMPLATE_COLS = `id, name, type, is_active, created_at,
  template_exercises(position, default_sets, default_reps_min, default_reps_max,
    target_rpe, rest_seconds, note, exercise:exercises(id, name, note))`;

async function fetchTemplate(id: string) {
  const { data, error } = await mcpDb()
    .from("workout_templates")
    .select(TEMPLATE_COLS)
    .eq("id", id)
    .order("position", { referencedTable: "template_exercises" })
    .single();
  if (error) fail(error.message);
  return data;
}

async function replaceTemplateExercises(
  templateId: string,
  exercises: TemplateExerciseInput[]
) {
  if (!exercises.length) fail("exercises est vide (au moins 1 exercice).");
  const db = mcpDb();
  const created: string[] = [];
  const rows: object[] = [];
  for (const [pos, ex] of exercises.entries()) {
    const match = await matchOrCreateExercise(ex.name, ex.catalog_note);
    if (match.created) created.push(ex.name);
    rows.push({
      template_id: templateId,
      exercise_id: match.id,
      position: pos + 1,
      default_sets: ex.sets ?? null,
      default_reps_min: ex.reps_min ?? null,
      default_reps_max: ex.reps_max ?? null,
      target_rpe: ex.target_rpe ?? null,
      rest_seconds: ex.rest_seconds ?? null,
      note: ex.note ?? null,
    });
  }
  // Remplacement COMPLET de la liste (l'ordre du tableau = position)
  const { error: delErr } = await db
    .from("template_exercises")
    .delete()
    .eq("template_id", templateId);
  if (delErr) fail(delErr.message);
  const { error: insErr } = await db.from("template_exercises").insert(rows);
  if (insErr) fail(insErr.message);
  return created;
}

export async function listWorkoutTemplates(includeArchived = false) {
  let q = mcpDb()
    .from("workout_templates")
    .select(TEMPLATE_COLS)
    .order("name")
    .order("position", { referencedTable: "template_exercises" });
  if (!includeArchived) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) fail(error.message);
  return { count: (data ?? []).length, templates: data ?? [] };
}

export async function createWorkoutTemplate(input: {
  name: string;
  type?: string;
  exercises: TemplateExerciseInput[];
}) {
  const type = input.type ?? "muscu";
  if (!WORKOUT_TYPES.includes(type)) fail(`type invalide (${WORKOUT_TYPES.join("|")}).`);
  if (!input.name?.trim()) fail("name est obligatoire.");
  const { data: tpl, error } = await mcpDb()
    .from("workout_templates")
    .insert({ name: input.name.trim(), type })
    .select("id")
    .single();
  if (error) fail(error.message);
  const created = await replaceTemplateExercises(tpl.id, input.exercises);
  return { template: await fetchTemplate(tpl.id), exercises_created: created };
}

export async function updateWorkoutTemplate(input: {
  id: string;
  name?: string;
  type?: string;
  is_active?: boolean;
  exercises?: TemplateExerciseInput[];
}) {
  const db = mcpDb();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.type !== undefined) {
    if (!WORKOUT_TYPES.includes(input.type)) fail(`type invalide (${WORKOUT_TYPES.join("|")}).`);
    patch.type = input.type;
  }
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (Object.keys(patch).length === 0 && input.exercises === undefined)
    fail("Aucun champ à modifier.");

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("workout_templates").update(patch).eq("id", input.id);
    if (error) fail(error.message);
  }
  let created: string[] = [];
  if (input.exercises !== undefined) {
    created = await replaceTemplateExercises(input.id, input.exercises);
  }
  return { template: await fetchTemplate(input.id), exercises_created: created };
}

export async function listExercises(query?: string) {
  let q = mcpDb()
    .from("exercises")
    .select("id, name, muscle_group, measure_type, note")
    .order("name");
  if (query?.trim()) q = q.ilike("name", `%${query.trim()}%`);
  const { data, error } = await q;
  if (error) fail(error.message);
  return { count: (data ?? []).length, exercises: data ?? [] };
}

export async function createExercise(input: {
  name: string;
  muscle_group?: string;
  measure_type?: string;
  note?: string;
}) {
  if (!input.name?.trim()) fail("name est obligatoire.");
  const db = mcpDb();
  const { data: existing } = await db
    .from("exercises")
    .select("id, name")
    .ilike("name", input.name.trim())
    .maybeSingle();
  if (existing) fail(`L'exercice "${existing.name}" existe déjà (utilise update_exercise).`);
  const { data, error } = await db
    .from("exercises")
    .insert({
      name: input.name.trim(),
      muscle_group: input.muscle_group ?? null,
      measure_type: input.measure_type ?? "reps",
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) fail(error.message);
  return data;
}

export async function updateExercise(
  id: string,
  fields: { name?: string; muscle_group?: string; measure_type?: string; note?: string }
) {
  const patch = Object.fromEntries(
    Object.entries(fields).filter(
      ([k, v]) => ["name", "muscle_group", "measure_type", "note"].includes(k) && v !== undefined
    )
  );
  if (Object.keys(patch).length === 0) fail("Aucun champ à modifier.");
  // Renommer conserve tout l'historique : les sets référencent l'id.
  const { data, error } = await mcpDb()
    .from("exercises")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) fail(error.message);
  return data;
}

/** Charge un workout et refuse d'y toucher si c'est un baseline seedé. */
async function loadMutableWorkout(id: string) {
  const { data, error } = await mcpDb()
    .from("workouts")
    .select("id, notes")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error.message);
  if (!data) fail(`Séance introuvable : ${id}.`);
  if (data.notes === BASELINE_NOTE)
    fail(
      "Séance baseline protégée (poids de départ du seed) — ni modifiable ni supprimable."
    );
  return data;
}

export async function updateWorkout(input: {
  id: string;
  date?: string;
  duration_min?: number;
  distance_km?: number;
  run_type?: string;
  perceived_intensity?: number;
  notes?: string;
  exercises?: WorkoutExerciseInput[];
}) {
  await loadMutableWorkout(input.id);
  const db = mcpDb();
  const patch: Record<string, unknown> = {};
  if (input.date !== undefined) patch.workout_date = assertDate(input.date);
  if (input.duration_min !== undefined) patch.duration_min = input.duration_min;
  if (input.distance_km !== undefined) patch.distance_km = input.distance_km;
  if (input.run_type !== undefined) patch.run_type = input.run_type;
  if (input.perceived_intensity !== undefined)
    patch.perceived_intensity = input.perceived_intensity;
  if (input.notes !== undefined) patch.notes = input.notes;

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("workouts").update(patch).eq("id", input.id);
    if (error) fail(error.message);
  }

  let setsCreated = 0;
  let created: string[] = [];
  if (input.exercises !== undefined) {
    // Remplacement complet des séries de CETTE séance uniquement
    const { error: delErr } = await db
      .from("workout_sets")
      .delete()
      .eq("workout_id", input.id);
    if (delErr) fail(delErr.message);
    const built = await buildSetRows(input.id, input.exercises);
    created = built.created;
    if (built.rows.length) {
      const { error: insErr } = await db.from("workout_sets").insert(built.rows);
      if (insErr) fail(insErr.message);
    }
    setsCreated = built.rows.length;
  }

  const { data: workout, error: wErr } = await db
    .from("workouts")
    .select("*, workout_sets(position, set_number, reps, weight_kg, duration_s, distance_m, exercise:exercises(name))")
    .eq("id", input.id)
    .single();
  if (wErr) fail(wErr.message);
  return { workout, sets_replaced: input.exercises !== undefined, sets_created: setsCreated, exercises_created: created };
}

export async function deleteWorkout(id: string) {
  await loadMutableWorkout(id);
  const { error } = await mcpDb().from("workouts").delete().eq("id", id);
  if (error) fail(error.message);
  return { deleted: true, id };
}

export async function getBodyMetrics(startDate: string, endDate: string) {
  const start = assertDate(startDate, "start_date");
  const end = assertDate(endDate, "end_date");
  const { data, error } = await mcpDb()
    .from("body_metrics")
    .select("*")
    .gte("metric_date", start)
    .lte("metric_date", end)
    .order("metric_date");
  if (error) fail(error.message);
  return { count: (data ?? []).length, metrics: data ?? [] };
}

export async function deleteBodyMetric(date: string) {
  const d = assertDate(date);
  const { error, count } = await mcpDb()
    .from("body_metrics")
    .delete({ count: "exact" })
    .eq("metric_date", d);
  if (error) fail(error.message);
  if (!count) fail(`Aucune pesée au ${d}.`);
  return { deleted: true, date: d };
}
