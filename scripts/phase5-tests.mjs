// Tests Phase 5 (Tendances) : les calculs de l'app (src/lib/trends.mjs,
// src/lib/alan.mjs — les modules mêmes que la page utilise) sont exécutés
// sur des données de test insérées en base puis relues EXACTEMENT comme
// l'app les relit, et comparés à des CALCULS DE RÉFÉRENCE refaits en dur
// ci-dessous. Nettoyage complet vérifié.
// Conventions : pesées/repas en 1999, workouts en 2126, préfixe __P5.
import { weeklyWeightAverages, exerciseProgression, periodAverages, sessionsPerWeek } from "../src/lib/trends.mjs";
import { alanCounts } from "../src/lib/alan.mjs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SRK) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(2);
}

let failures = 0;
function check(label, cond, detail = "") {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function rest(method, path, body) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function cleanup() {
  await rest("DELETE", "meal_logs?log_date=gte.1999-07-12&log_date=lte.1999-07-18");
  await rest("DELETE", "body_metrics?metric_date=gte.1999-07-05&metric_date=lte.1999-07-18");
  await rest("DELETE", "workouts?workout_date=gte.2126-06-01&workout_date=lte.2126-06-20");
  await rest("DELETE", "exercises?name=like.__P5*");
  await rest("DELETE", "recipes?name=like.__P5*");
}

await cleanup();

try {
  // ================= 1. Moyenne hebdomadaire de poids =================
  // Jeu : S1 (lundi 1999-07-05) 84.0 / 83.6 / 83.8 / 83.2 ; S2 83.0 / 82.6
  // Référence refaite en dur : S1 = (84+83.6+83.8+83.2)/4 = 83.65 ; S2 = 82.8
  await rest("POST", "body_metrics", [
    { metric_date: "1999-07-05", weight_kg: 84.0, waist_cm: 90 },
    { metric_date: "1999-07-07", weight_kg: 83.6, waist_cm: null },
    { metric_date: "1999-07-09", weight_kg: 83.8, waist_cm: null },
    { metric_date: "1999-07-11", weight_kg: 83.2, waist_cm: null },
    { metric_date: "1999-07-12", weight_kg: 83.0, waist_cm: null },
    { metric_date: "1999-07-15", weight_kg: 82.6, waist_cm: 88 },
  ]);
  // Relecture EXACTEMENT comme getBodyTrends (mêmes colonnes, même ordre)
  const metrics = await rest(
    "GET",
    "body_metrics?metric_date=gte.1999-07-05&metric_date=lte.1999-07-18&select=metric_date,weight_kg,waist_cm&order=metric_date"
  );
  const weekly = weeklyWeightAverages(metrics);
  // (84 + 83.6 + 83.8 + 83.2) / 4 = 334.6 / 4 = 83.65 ; (83 + 82.6) / 2 = 82.8
  const REF_WEEKLY = [
    { week_start: "1999-07-05", avg_weight_kg: 83.65, measurements: 4 },
    { week_start: "1999-07-12", avg_weight_kg: 82.8, measurements: 2 },
  ];
  check(
    "moyenne hebdo de poids identique au calcul de référence (83.65 / 82.8)",
    eq(weekly, REF_WEEKLY),
    JSON.stringify(weekly)
  );

  // ================= 2. Progression de charge par exercice =================
  // 3 séances insérées DANS LE DÉSORDRE (17, 03, 10) — la progression doit
  // revenir triée par date. Référence en dur :
  //   03/06 : max 62.5, volume 5×60 + 5×62.5 = 612.5
  //   10/06 : max 70,   volume 5×65 + 3×70   = 535
  //   17/06 : max 55,   volume 8×55          = 440
  const [exo] = await rest("POST", "exercises", { name: "__P5_EXO__", measure_type: "reps" });
  const workoutRows = await rest("POST", "workouts", [
    { workout_date: "2126-06-17", type: "muscu" },
    { workout_date: "2126-06-03", type: "muscu" },
    { workout_date: "2126-06-10", type: "muscu" },
  ]);
  const byDate = new Map(workoutRows.map((w) => [w.workout_date, w.id]));
  const setRows = [
    ["2126-06-03", 1, 5, 60], ["2126-06-03", 2, 5, 62.5],
    ["2126-06-10", 1, 5, 65], ["2126-06-10", 2, 3, 70],
    ["2126-06-17", 1, 8, 55],
  ].map(([d, n, reps, w]) => ({
    workout_id: byDate.get(d), exercise_id: exo.id, position: 1, set_number: n, reps, weight_kg: w,
  }));
  await rest("POST", "workout_sets", setRows);
  // Relecture comme getProgressionSeries (sets + date de séance jointe)
  const rawSets = await rest(
    "GET",
    `workout_sets?exercise_id=eq.${exo.id}&select=reps,weight_kg,workout:workouts!inner(workout_date)`
  );
  const progression = exerciseProgression(
    rawSets.map((s) => ({ workout_date: s.workout.workout_date, reps: s.reps, weight_kg: s.weight_kg }))
  );
  const REF_PROGRESSION = [
    { date: "2126-06-03", max_weight_kg: 62.5, volume: 5 * 60 + 5 * 62.5 },
    { date: "2126-06-10", max_weight_kg: 70, volume: 5 * 65 + 3 * 70 },
    { date: "2126-06-17", max_weight_kg: 55, volume: 8 * 55 },
  ];
  check(
    "progression de charge : valeurs max/volume justes, ORDONNÉES par date (insérées en désordre)",
    eq(progression, REF_PROGRESSION),
    JSON.stringify(progression)
  );

  // ================= 3. Moyennes kcal/protéines 7 jours =================
  // Semaine 1999-07-12→18, 3 jours loggés :
  //   12/07 : 1200+800 = 2000 kcal / 90+60 = 150 P   (poisson + œufs)
  //   13/07 : 2500 / 180                              (pâtes)
  //   14/07 : 900+600+300 = 1800 / 70+40+10 = 120     (poisson + 2× œufs)
  // Référence : kcal (2000+2500+1800)/3 = 2100 ; P (150+180+120)/3 = 150
  const recipes = await rest("POST", "recipes", [
    { name: "__P5_R_FISH__", category: "diner", kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, ingredients: [{ item: "t", qty: 1, unit: "g" }], tags: ["poisson"], source: "florian" },
    { name: "__P5_R_PASTA__", category: "diner", kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, ingredients: [{ item: "t", qty: 1, unit: "g" }], tags: ["pates"], source: "florian" },
    { name: "__P5_R_EGGS__", category: "petit_dej", kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, ingredients: [{ item: "t", qty: 1, unit: "g" }], tags: ["oeufs"], source: "florian" },
  ]);
  const rid = Object.fromEntries(recipes.map((r) => [r.name, r.id]));
  await rest("POST", "meal_logs", [
    { log_date: "1999-07-12", slot: "diner", recipe_id: rid.__P5_R_FISH__, kcal: 1200, protein_g: 90, carbs_g: 0, fat_g: 0 },
    { log_date: "1999-07-12", slot: "petit_dej", recipe_id: rid.__P5_R_EGGS__, kcal: 800, protein_g: 60, carbs_g: 0, fat_g: 0 },
    { log_date: "1999-07-13", slot: "diner", recipe_id: rid.__P5_R_PASTA__, kcal: 2500, protein_g: 180, carbs_g: 0, fat_g: 0 },
    { log_date: "1999-07-14", slot: "diner", recipe_id: rid.__P5_R_FISH__, kcal: 900, protein_g: 70, carbs_g: 0, fat_g: 0 },
    { log_date: "1999-07-14", slot: "petit_dej", recipe_id: rid.__P5_R_EGGS__, kcal: 600, protein_g: 40, carbs_g: 0, fat_g: 0 },
    { log_date: "1999-07-14", slot: "collation", recipe_id: rid.__P5_R_EGGS__, kcal: 300, protein_g: 10, carbs_g: 0, fat_g: 0 },
  ]);
  // Relecture comme getMealAverages
  const logs = await rest(
    "GET",
    "meal_logs?log_date=gte.1999-07-12&log_date=lte.1999-07-18&select=log_date,kcal,protein_g"
  );
  const avg = periodAverages(logs);
  const REF_AVG = { days_logged: 3, kcal_avg: (2000 + 2500 + 1800) / 3, protein_avg: (150 + 180 + 120) / 3 };
  check(
    "moyennes 7j : 2100 kcal / 150 P sur 3 jours loggés (calcul de référence)",
    eq(avg, REF_AVG),
    JSON.stringify(avg)
  );

  // ================= 4. Compteurs Alan de la semaine =================
  // Référence : poisson 2 (ok min 2) · pates 1 (ok max 2) · hache 0 (ok)
  //             · oeufs 3 (ok max 8) · legumineuses 0 (KO min 1)
  const logsWithTags = await rest(
    "GET",
    "meal_logs?log_date=gte.1999-07-12&log_date=lte.1999-07-18&recipe_id=not.is.null&select=log_date,recipe:recipes(tags)"
  );
  const counts = alanCounts(logsWithTags.map((l) => ({ tags: l.recipe?.tags ?? null })));
  const byTag = Object.fromEntries(counts.map((c) => [c.tag, c]));
  check(
    "compteurs Alan : poisson 2 ✓ · pâtes 1 ✓ · haché 0 ✓ · œufs 3 ✓ · légumineuses 0 ✗",
    byTag.poisson.count === 2 && byTag.poisson.ok === true &&
      byTag.pates.count === 1 && byTag.pates.ok === true &&
      byTag.hache.count === 0 && byTag.hache.ok === true &&
      byTag.oeufs.count === 3 && byTag.oeufs.ok === true &&
      byTag.legumineuses.count === 0 && byTag.legumineuses.ok === false,
    JSON.stringify(counts)
  );

  // ================= 5. Séances par semaine par type =================
  await rest("POST", "workouts", { workout_date: "2126-06-11", type: "padel" });
  const wks = await rest(
    "GET",
    "workouts?workout_date=gte.2126-06-01&workout_date=lte.2126-06-20&select=workout_date,type&order=workout_date"
  );
  const sessions = sessionsPerWeek(wks);
  // Lundis 2126 : 03/06, 10/06, 17/06 (les séances muscu tombent des lundis,
  // le padel du 11/06 appartient à la semaine du 10/06)
  const REF_SESSIONS = [
    { week_start: "2126-06-03", counts: { muscu: 1 }, total: 1 },
    { week_start: "2126-06-10", counts: { muscu: 1, padel: 1 }, total: 2 },
    { week_start: "2126-06-17", counts: { muscu: 1 }, total: 1 },
  ];
  check(
    "séances/semaine par type : 1 muscu · 1 muscu + 1 padel · 1 muscu",
    eq(sessions, REF_SESSIONS),
    JSON.stringify(sessions)
  );
} finally {
  await cleanup();
}

// ================= Nettoyage vérifié =================
const left = await Promise.all([
  rest("GET", "meal_logs?log_date=gte.1999-07-12&log_date=lte.1999-07-18&select=id"),
  rest("GET", "body_metrics?metric_date=gte.1999-07-05&metric_date=lte.1999-07-18&select=id"),
  rest("GET", "workouts?workout_date=gte.2126-06-01&workout_date=lte.2126-06-20&select=id"),
  rest("GET", "exercises?name=like.__P5*&select=id"),
  rest("GET", "recipes?name=like.__P5*&select=id"),
]);
check("nettoyage : zéro donnée de test restante", left.every((l) => l.length === 0));

console.log(failures === 0 ? "  → tests tendances : tous passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
