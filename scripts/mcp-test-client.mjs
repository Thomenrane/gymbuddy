// Client de test MCP (SDK officiel) : appelle les 14 tools du PRD §5 avec
// assertions sur le CONTENU des réponses. Utilisé par verify-phase4.sh.
// Usage : MCP_URL=http://localhost:PORT/api/mcp MCP_SECRET=... node scripts/mcp-test-client.mjs
// Le secret est lu dans l'env et n'est jamais affiché.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.MCP_URL;
const SECRET = process.env.MCP_SECRET;
if (!URL_ || !SECRET) {
  console.error("MCP_URL et MCP_SECRET requis dans l'env.");
  process.exit(2);
}

const D = "1999-11-20"; // date de test, jamais de vraies données
let failures = 0;

function check(label, cond, detail = "") {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
}

const client = new Client({ name: "verify-phase4", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { Authorization: `Bearer ${SECRET}` } },
  })
);

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "{}";
  return { data: JSON.parse(text), isError: Boolean(res.isError) };
}

// --- Inventaire des tools ---
const { tools } = await client.listTools();
const EXPECTED = [
  "get_targets", "update_targets", "get_day", "get_summary", "search_recipes",
  "add_recipe", "update_recipe", "log_meal", "update_meal_log", "delete_meal_log",
  "log_workout", "get_workouts", "get_exercise_history", "log_body_metric",
];
const names = tools.map((t) => t.name);
check(`14 tools exposés (${names.length})`, EXPECTED.every((t) => names.includes(t)) && names.length === 14);

// --- 1/2. get_targets + update_targets (avec restauration) ---
let r = await call("get_targets");
check("get_targets : kcal=2270, protein_g=170", r.data.kcal === 2270 && r.data.protein_g === 170);

r = await call("update_targets", { kcal: 2400 });
check("update_targets : kcal→2400", r.data.kcal === 2400);
r = await call("update_targets", { kcal: 2270 });
check("update_targets : restauré à 2270", r.data.kcal === 2270);

// --- 5. search_recipes ---
r = await call("search_recipes", { query: "poulet" });
check(
  "search_recipes 'poulet' : D1 présent avec macros",
  r.data.count >= 2 && r.data.recipes.some((x) => x.code === "D1" && x.kcal === 660 && x.protein_g != null)
);

// --- 6/7. add_recipe + update_recipe ---
r = await call("add_recipe", {
  name: "__MCP_TEST_RECIPE__",
  category: "collation",
  kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 8,
  ingredients: [{ item: "ingrédient test", qty: 1, unit: "g" }],
  tags: ["__test__"],
});
const recipeId = r.data.id;
check("add_recipe : créée avec source='claude'", Boolean(recipeId) && r.data.source === "claude");

r = await call("update_recipe", { id: recipeId, kcal: 320 });
check("update_recipe : kcal 300→320", r.data.kcal === 320);

// --- 8. log_meal (recette PD1 ×1.25, macros dénormalisées) ---
r = await call("log_meal", { date: D, slot: "dejeuner", recipe_code: "PD1", portion_factor: 1.25 });
const mealId = r.data.id;
check(
  "log_meal PD1 ×1.25 : 650 kcal / 51.3 P (dénormalisé)",
  r.data.kcal === 650 && Number(r.data.protein_g) === 51.3 && r.data.log_date === D
);

// --- 3. get_day ---
r = await call("get_day", { date: D });
check(
  "get_day : totaux=650 kcal, delta kcal=-1620, cibles jointes",
  r.data.totals.kcal === 650 && r.data.delta_vs_targets.kcal === -1620 && r.data.targets.kcal === 2270
);

// --- 9/10. update_meal_log + delete_meal_log ---
r = await call("update_meal_log", { id: mealId, kcal: 600, notes: "édité via MCP" });
check("update_meal_log : kcal 650→600 + notes", r.data.kcal === 600 && r.data.notes === "édité via MCP");

r = await call("delete_meal_log", { id: mealId });
check("delete_meal_log : confirmé", r.data.deleted === true);

// --- 11. log_workout (exo connu + exo créé à la volée) ---
r = await call("log_workout", {
  date: D,
  type: "muscu",
  template_name: "Day 1 — Lourd (force)",
  duration_min: 60,
  perceived_intensity: 8,
  exercises: [
    { name: "Back Squat", sets: [{ reps: 5, weight_kg: 72.5 }, { reps: 5, weight_kg: 72.5 }] },
    { name: "__MCP_TEST_EXO__", sets: [{ reps: 10 }] },
  ],
});
check(
  "log_workout : 3 séries, exo '__MCP_TEST_EXO__' créé, template matché",
  r.data.sets_created === 3 &&
    r.data.exercises_created.includes("__MCP_TEST_EXO__") &&
    r.data.workout.template_id != null
);

// --- 12. get_workouts ---
r = await call("get_workouts", { start_date: "1999-11-19", end_date: "1999-11-21" });
check(
  "get_workouts : 1 séance avec ses séries nommées",
  r.data.count === 1 &&
    r.data.workouts[0].workout_sets.length === 3 &&
    r.data.workouts[0].workout_sets.some((s) => s.exercise?.name === "Back Squat")
);

// --- 13. get_exercise_history ---
r = await call("get_exercise_history", { exercise_name: "Back Squat", limit: 10 });
check(
  "get_exercise_history : Back Squat, série 72.5 kg retrouvée",
  r.data.exercise.name === "Back Squat" &&
    r.data.workouts.some((w) => w.sets.some((s) => Number(s.weight_kg) === 72.5))
);

// --- 14. log_body_metric (upsert) ---
r = await call("log_body_metric", { date: D, weight_kg: 82.5 });
check("log_body_metric : 82.5 kg", Number(r.data.weight_kg) === 82.5);
r = await call("log_body_metric", { date: D, weight_kg: 82.0, waist_cm: 88 });
check("log_body_metric : upsert même date (82.0 kg + taille)", Number(r.data.weight_kg) === 82 && Number(r.data.waist_cm) === 88);

// --- 4. get_summary ---
r = await call("get_summary", { start_date: "1999-11-15", end_date: "1999-11-21" });
check(
  "get_summary : moyenne hebdo poids=82, 1 muscu, compteurs Alan présents",
  r.data.weight.weekly_average.length === 1 &&
    Number(r.data.weight.weekly_average[0].avg_weight_kg) === 82 &&
    r.data.workouts_by_type.muscu === 1 &&
    typeof r.data.alan_counters.poisson === "number"
);

// --- erreur métier propre ---
r = await call("log_meal", { date: D, slot: "dejeuner", recipe_code: "ZZZ99" });
check("erreur métier lisible (recette inconnue)", r.isError && String(r.data.error).includes("ZZZ99"));

await client.close();
console.log(failures === 0 ? "  → client MCP : tous les tests passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
