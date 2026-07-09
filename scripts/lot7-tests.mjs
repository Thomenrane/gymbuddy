// Tests Lot 7 (couverture MCP complète) : 9 tools avec assertions de
// contenu, vérifications en base via REST service-role, protections
// baselines, et preuve explicite que modifier un template ne réécrit
// aucun workout passé. Utilisé par scripts/verify-lot7.sh.
// Conventions de données de test : workouts en 2126 (après les baselines
// 2026), pesées en 1999 — jamais de vraies données.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_URL;
const SECRET = process.env.MCP_SECRET;
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!MCP_URL || !SECRET || !SB || !SRK) {
  console.error("MCP_URL, MCP_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(2);
}

const W1 = "2126-05-01"; // workout de test (édité puis supprimé)
const W2 = "2126-05-02"; // workout de test (historique du renommage)
const BM1 = "1999-06-21";
const BM2 = "1999-06-22";
const BASELINE_NOTE = "baseline seed — poids de départ";
let failures = 0;

function check(label, cond, detail = "") {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
}

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
  await rest("DELETE", `workouts?workout_date=in.(${W1},${W2})`);
  await rest("DELETE", `workout_templates?name=like.__LOT7*`);
  await rest("DELETE", `exercises?name=like.__LOT7*`);
  await rest("DELETE", `body_metrics?metric_date=in.(${BM1},${BM2})`);
  await rest("DELETE", `recipes?name=eq.__LOT7_RECIPE__`);
}

await cleanup(); // restes d'un run précédent raté

// État de référence AVANT : 3 templates réels, baselines et leurs séries.
const realTemplatesBefore = await rest("GET", "workout_templates?select=id,name&order=name");
const baselinesBefore = await rest(
  "GET",
  `workouts?notes=eq.${encodeURIComponent(BASELINE_NOTE)}&select=id,workout_date,workout_sets(id)`
);
const baselineSetsBefore = baselinesBefore.reduce((s, w) => s + w.workout_sets.length, 0);
check(
  `état initial : 3 templates réels, 3 baselines (${baselineSetsBefore} séries)`,
  realTemplatesBefore.length === 3 && baselinesBefore.length === 3
);

const client = new Client({ name: "verify-lot7", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${SECRET}` } },
  })
);
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return { data: JSON.parse(res.content?.[0]?.text ?? "{}"), isError: Boolean(res.isError) };
}

try {
  // --- Inventaire ---
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  const LOT7 = [
    "list_workout_templates", "create_workout_template", "update_workout_template",
    "list_exercises", "create_exercise", "update_exercise", "update_workout",
    "delete_workout", "get_body_metrics", "delete_body_metric",
  ];
  // Inventaire total : 14 (phase 4) + 5 (plan) + 10 (lot 7) = 29.
  check(
    `10 tools lot 7 exposés (total ${names.length})`,
    LOT7.every((t) => names.includes(t)) && names.length === 29
  );

  // --- 1. create_workout_template : 2 exos créés à la volée, tous champs ---
  let r = await call("create_workout_template", {
    name: "__LOT7_TPL__",
    type: "muscu",
    exercises: [
      { name: "__LOT7_EXO_A__", sets: 3, reps_min: 4, reps_max: 6, target_rpe: 8, rest_seconds: 150, note: "superset test A", catalog_note: "note test A" },
      { name: "__LOT7_EXO_B__", sets: 2, reps_min: 8, reps_max: 12, target_rpe: 7, rest_seconds: 90, catalog_note: "note test B" },
    ],
  });
  const tplId = r.data.template?.id;
  check(
    "create_workout_template : créé, 2 exos créés à la volée",
    !r.isError && Boolean(tplId) && r.data.exercises_created.length === 2
  );
  const teRows = await rest(
    "GET",
    `template_exercises?template_id=eq.${tplId}&select=position,default_sets,default_reps_min,default_reps_max,target_rpe,rest_seconds,note,exercise:exercises(name,note)&order=position`
  );
  check(
    "en base : reps min/max, RPE, repos, note de LIGNE et note catalogue renseignés",
    teRows.length === 2 &&
      teRows[0].exercise.name === "__LOT7_EXO_A__" &&
      teRows[0].default_sets === 3 &&
      teRows[0].default_reps_min === 4 &&
      teRows[0].default_reps_max === 6 &&
      teRows[0].target_rpe === 8 &&
      teRows[0].rest_seconds === 150 &&
      teRows[0].note === "superset test A" &&
      teRows[0].exercise.note === "note test A" &&
      teRows[1].note === null &&
      teRows[1].exercise.note === "note test B"
  );

  // --- 2. Workout passé référençant le template (AVANT modification) ---
  r = await call("log_workout", {
    date: W1,
    type: "muscu",
    template_name: "__LOT7_TPL__",
    exercises: [
      { name: "__LOT7_EXO_A__", sets: [{ reps: 5, weight_kg: 60 }, { reps: 5, weight_kg: 60 }] },
      { name: "__LOT7_EXO_B__", sets: [{ reps: 10, weight_kg: 20 }] },
    ],
  });
  const w1Id = r.data.workout?.id;
  check(
    "log_workout : séance de test liée au template (3 séries)",
    !r.isError && r.data.workout.template_id === tplId && r.data.sets_created === 3
  );
  const setsSnapshot = JSON.stringify(
    await rest("GET", `workout_sets?workout_id=eq.${w1Id}&select=position,set_number,reps,weight_kg&order=position,set_number`)
  );

  // --- 3. update_workout_template : remplacement complet, ordre inversé + 3e exo ---
  r = await call("update_workout_template", {
    id: tplId,
    exercises: [
      { name: "__LOT7_EXO_B__", sets: 2, reps_min: 8, reps_max: 12, target_rpe: 7, rest_seconds: 90, note: "tempo 3-1-1" },
      { name: "__LOT7_EXO_A__", sets: 3, reps_min: 4, reps_max: 6, target_rpe: 8, rest_seconds: 150 },
      { name: "__LOT7_EXO_C__", sets: 4, reps_min: 10, reps_max: 15, target_rpe: 6, rest_seconds: 60, catalog_note: "note test C" },
    ],
  });
  check(
    "update_workout_template : liste remplacée, __LOT7_EXO_C__ créé à la volée",
    !r.isError && r.data.exercises_created.includes("__LOT7_EXO_C__")
  );
  // Note de ligne écrite par update_workout_template, RELUE via list_workout_templates
  r = await call("list_workout_templates", {});
  const listedTpl = r.data.templates.find((t) => t.name === "__LOT7_TPL__");
  check(
    "note de ligne relue via list_workout_templates (B pos 1 : « tempo 3-1-1 », A pos 2 : null)",
    listedTpl?.template_exercises?.[0]?.note === "tempo 3-1-1" &&
      listedTpl?.template_exercises?.[1]?.note === null
  );
  const teAfter = await rest(
    "GET",
    `template_exercises?template_id=eq.${tplId}&select=position,exercise:exercises(name)&order=position`
  );
  check(
    "en base : 3 lignes, ordre inversé (B=1, A=2, C=3)",
    teAfter.length === 3 &&
      teAfter[0].exercise.name === "__LOT7_EXO_B__" &&
      teAfter[1].exercise.name === "__LOT7_EXO_A__" &&
      teAfter[2].exercise.name === "__LOT7_EXO_C__"
  );

  // --- 4. TEST EXPLICITE : le workout passé n'a PAS été réécrit ---
  const setsAfterTplEdit = JSON.stringify(
    await rest("GET", `workout_sets?workout_id=eq.${w1Id}&select=position,set_number,reps,weight_kg&order=position,set_number`)
  );
  check(
    "modifier le template ne réécrit AUCUN workout passé (séries identiques octet pour octet)",
    setsAfterTplEdit === setsSnapshot
  );

  // --- 5. Archivage + list_workout_templates ---
  r = await call("update_workout_template", { id: tplId, is_active: false });
  check("archivage : is_active=false", !r.isError && r.data.template.is_active === false);
  r = await call("list_workout_templates", {});
  const defaultNames = r.data.templates.map((t) => t.name);
  check(
    "list sans include_archived : template exclu, les 3 réels présents",
    r.data.count === 3 &&
      !defaultNames.includes("__LOT7_TPL__") &&
      realTemplatesBefore.every((t) => defaultNames.includes(t.name))
  );
  r = await call("list_workout_templates", { include_archived: true });
  check(
    "list avec include_archived : template visible (4 au total)",
    r.data.count === 4 && r.data.templates.some((t) => t.name === "__LOT7_TPL__")
  );

  // --- 6. create_exercise + doublon + update_exercise (renommage) ---
  r = await call("create_exercise", { name: "__LOT7_EXO_D__", muscle_group: "dos", note: "machine test" });
  const exoDId = r.data.id;
  check(
    "create_exercise : créé avec muscle_group + note",
    !r.isError && Boolean(exoDId) && r.data.muscle_group === "dos" && r.data.note === "machine test"
  );
  r = await call("create_exercise", { name: "__lot7_exo_d__" });
  check("create_exercise doublon (casse différente) → erreur métier", r.isError && String(r.data.error).includes("existe déjà"));

  // --- 6bis. list_exercises : catalogue complet + filtre ---
  r = await call("list_exercises", {});
  check(
    "list_exercises : catalogue complet (Back Squat présent, groupe jambes)",
    !r.isError &&
      r.data.count >= 13 &&
      r.data.exercises.some((e) => e.name === "Back Squat" && e.muscle_group === "jambes")
  );
  r = await call("list_exercises", { query: "__LOT7_EXO" });
  check(
    "list_exercises avec query : les 4 exos de test, note catalogue exposée",
    r.data.count === 4 &&
      r.data.exercises.some((e) => e.name === "__LOT7_EXO_D__" && e.note === "machine test")
  );

  r = await call("log_workout", {
    date: W2,
    type: "muscu",
    exercises: [{ name: "__LOT7_EXO_D__", sets: [{ reps: 10, weight_kg: 40 }] }],
  });
  const w2Id = r.data.workout?.id;
  check("séance de test sur __LOT7_EXO_D__ (40 kg)", !r.isError && r.data.sets_created === 1);

  r = await call("update_exercise", { id: exoDId, name: "__LOT7_EXO_D2__" });
  check("update_exercise : renommé D → D2", !r.isError && r.data.name === "__LOT7_EXO_D2__");
  r = await call("get_exercise_history", { exercise_name: "__LOT7_EXO_D2__" });
  check(
    "get_exercise_history sous le NOUVEAU nom : la série 40 kg retrouvée",
    !r.isError &&
      r.data.exercise.name === "__LOT7_EXO_D2__" &&
      r.data.workouts.some((w) => w.sets.some((s) => Number(s.weight_kg) === 40))
  );

  // --- 7. update_workout : remplacement des séries, puis delete_workout ---
  r = await call("update_workout", {
    id: w1Id,
    duration_min: 45,
    exercises: [{ name: "__LOT7_EXO_A__", sets: [{ reps: 8, weight_kg: 65 }] }],
  });
  check(
    "update_workout : séries remplacées (3 → 1) + duration_min=45",
    !r.isError && r.data.sets_created === 1 && r.data.workout.duration_min === 45
  );
  const w1Sets = await rest("GET", `workout_sets?workout_id=eq.${w1Id}&select=reps,weight_kg`);
  check(
    "en base : 1 série 8 reps @ 65 kg",
    w1Sets.length === 1 && w1Sets[0].reps === 8 && Number(w1Sets[0].weight_kg) === 65
  );
  r = await call("delete_workout", { id: w1Id });
  const w1Left = await rest("GET", `workouts?id=eq.${w1Id}&select=id`);
  const w1SetsLeft = await rest("GET", `workout_sets?workout_id=eq.${w1Id}&select=id`);
  check(
    "delete_workout : séance et séries supprimées (cascade)",
    r.data.deleted === true && w1Left.length === 0 && w1SetsLeft.length === 0
  );

  // --- 8. Baselines protégés ---
  const baselineId = baselinesBefore[0].id;
  r = await call("delete_workout", { id: baselineId });
  check(
    "delete_workout sur un baseline → erreur métier explicite",
    r.isError && String(r.data.error).includes("baseline")
  );
  r = await call("update_workout", { id: baselineId, duration_min: 1 });
  check("update_workout sur un baseline → refusé aussi", r.isError);
  const blAfter = await rest(
    "GET",
    `workouts?id=eq.${baselineId}&select=id,notes,duration_min,workout_sets(id)`
  );
  check(
    "baseline intact en base (notes, séries)",
    blAfter.length === 1 &&
      blAfter[0].notes === BASELINE_NOTE &&
      blAfter[0].workout_sets.length === baselinesBefore[0].workout_sets.length
  );

  // --- 9. get_body_metrics + delete_body_metric ---
  await call("log_body_metric", { date: BM1, weight_kg: 83.1 });
  await call("log_body_metric", { date: BM2, weight_kg: 82.8, waist_cm: 88 });
  r = await call("get_body_metrics", { start_date: BM1, end_date: BM2 });
  check(
    "get_body_metrics : 2 pesées de la période, ordonnées",
    !r.isError &&
      r.data.count === 2 &&
      Number(r.data.metrics[0].weight_kg) === 83.1 &&
      Number(r.data.metrics[1].waist_cm) === 88
  );
  r = await call("delete_body_metric", { date: BM1 });
  const bmLeft = await rest("GET", `body_metrics?metric_date=eq.${BM1}&select=id`);
  check("delete_body_metric : pesée supprimée", r.data.deleted === true && bmLeft.length === 0);
  r = await call("delete_body_metric", { date: "1999-01-01" });
  check("delete_body_metric sans pesée → erreur métier", r.isError && String(r.data.error).includes("Aucune pesée"));

  // --- 10. update_recipe : is_active=false puis restauration ---
  r = await call("add_recipe", {
    name: "__LOT7_RECIPE__",
    category: "collation",
    kcal: 200, protein_g: 15, carbs_g: 20, fat_g: 5,
    ingredients: [{ item: "test", qty: 1, unit: "g" }],
  });
  const recipeId = r.data.id;
  r = await call("update_recipe", { id: recipeId, is_active: false });
  check("update_recipe : is_active=false", !r.isError && r.data.is_active === false);
  r = await call("search_recipes", { query: "__LOT7_RECIPE__" });
  check("recette désactivée absente de search_recipes", r.data.count === 0);
  r = await call("update_recipe", { id: recipeId, is_active: true });
  check("restauration : is_active=true", !r.isError && r.data.is_active === true);
} finally {
  await client.close();
  await cleanup();
}

// --- Nettoyage vérifié + invariants seed intacts (comptage avant/après) ---
const [tplLeft, exoLeft, wLeft, bmLeftAll, rLeft, realTemplatesAfter, baselinesAfter] =
  await Promise.all([
    rest("GET", "workout_templates?name=like.__LOT7*&select=id"),
    rest("GET", "exercises?name=like.__LOT7*&select=id"),
    rest("GET", `workouts?workout_date=in.(${W1},${W2})&select=id`),
    rest("GET", `body_metrics?metric_date=in.(${BM1},${BM2})&select=id`),
    rest("GET", "recipes?name=eq.__LOT7_RECIPE__&select=id"),
    rest("GET", "workout_templates?select=id,name"),
    rest("GET", `workouts?notes=eq.${encodeURIComponent(BASELINE_NOTE)}&select=id,workout_sets(id)`),
  ]);
const baselineSetsAfter = baselinesAfter.reduce((s, w) => s + w.workout_sets.length, 0);
check(
  "nettoyage : zéro donnée de test restante",
  [tplLeft, exoLeft, wLeft, bmLeftAll, rLeft].every((l) => l.length === 0)
);
check(
  `invariants : 3 templates réels et 3 baselines (${baselineSetsAfter} séries) intacts`,
  realTemplatesAfter.length === 3 &&
    baselinesAfter.length === 3 &&
    baselineSetsAfter === baselineSetsBefore
);

console.log(failures === 0 ? "  → tests lot 7 : tous passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
