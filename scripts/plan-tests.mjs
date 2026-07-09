// Tests Phase 6 (planificateur) : 5 tools MCP avec assertions de contenu
// + flux "logger depuis le plan" (module partagé plan-log.mjs) + nettoyage.
// Usage : MCP_URL=... MCP_SECRET=... NEXT_PUBLIC_SUPABASE_URL=...
//         SUPABASE_SERVICE_ROLE_KEY=... node scripts/plan-tests.mjs
// Données de test : semaine 1999-06-07 (lundi) → jamais de vraies données.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mealLogFromPlan } from "../src/lib/plan-log.mjs";

const MCP_URL = process.env.MCP_URL;
const SECRET = process.env.MCP_SECRET;
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!MCP_URL || !SECRET || !SB || !SRK) {
  console.error("MCP_URL, MCP_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(2);
}

const MON = "1999-06-07"; // lundi de la semaine de test
const TUE = "1999-06-08";
const SUN = "1999-06-13";
let failures = 0;

function check(label, cond, detail = "") {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
}

// --- Accès REST direct (service role) pour créer les fixtures et VÉRIFIER
// --- l'état réel de la base indépendamment des réponses MCP.
async function rest(method, path, body, headers = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function cleanup() {
  await rest("DELETE", `meal_plan_entries?plan_date=gte.${MON}&plan_date=lte.${SUN}`);
  await rest("DELETE", `meal_logs?log_date=gte.${MON}&log_date=lte.${SUN}`);
  await rest("DELETE", `recipes?code=in.(ZPT1,ZPT2)`);
}

// Recettes de test aux macros connues (calculs indépendants ci-dessous).
// R1 et R2 PARTAGENT "riz basmati test" en grammes ; les pièces ne se
// convertissent pas ; casse volontairement différente (normalisation).
const R1 = {
  code: "ZPT1", name: "__PLAN_TEST_R1__", category: "dejeuner",
  kcal: 600, protein_g: 45, carbs_g: 60, fat_g: 18, source: "florian",
  tags: ["poisson"],
  ingredients: [
    { item: "Riz basmati test", qty: 80, unit: "g" },
    { item: "Œufs test", qty: 2, unit: "pièce" },
  ],
};
const R2 = {
  code: "ZPT2", name: "__PLAN_TEST_R2__", category: "diner",
  kcal: 500, protein_g: 40, carbs_g: 50, fat_g: 15, source: "florian",
  tags: ["legumineuses"],
  ingredients: [
    { item: "riz basmati test", qty: 40, unit: "g" },
    { item: "Tomate test", qty: 1, unit: "pièce" },
  ],
};

await cleanup();
const [r1] = await rest("POST", "recipes", R1);
const [r2] = await rest("POST", "recipes", R2);

const client = new Client({ name: "verify-phase6", version: "1.0.0" });
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
  // --- Inventaire : les 5 tools plan exposés (19 au total) ---
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  const PLAN_TOOLS = ["get_plan", "plan_meal", "plan_week", "clear_plan", "get_shopping_list"];
  // Inventaire total : 14 (phase 4) + 5 (plan) + 9 (lot 7) = 28.
  check(
    `5 tools plan exposés (total ${names.length})`,
    PLAN_TOOLS.every((t) => names.includes(t)) && names.length === 28
  );

  // --- 1. plan_meal + upsert même jour+slot = REMPLACEMENT (FLAG 8) ---
  let r = await call("plan_meal", { date: MON, slot: "dejeuner", recipe_code: "ZPT1" });
  check("plan_meal ZPT1 lundi/dejeuner", !r.isError && r.data.plan_date === MON);

  r = await call("plan_meal", { date: MON, slot: "dejeuner", recipe_code: "ZPT2", portion_factor: 1.5 });
  check("plan_meal ZPT2 ×1.5 même jour+slot accepté", !r.isError);
  const slotRows = await rest(
    "GET",
    `meal_plan_entries?plan_date=eq.${MON}&slot=eq.dejeuner&select=recipe_id,portion_factor`
  );
  check(
    "upsert = remplacement : 1 seule ligne, recette ZPT2 ×1.5 (vérifié en base)",
    slotRows.length === 1 &&
      slotRows[0].recipe_id === r2.id &&
      Number(slotRows[0].portion_factor) === 1.5
  );

  // --- 2. plan_week ATOMIQUE : un code invalide → RIEN n'est écrit ---
  const before = await rest(
    "GET",
    `meal_plan_entries?plan_date=gte.${MON}&plan_date=lte.${SUN}&select=id,plan_date,slot`
  );
  r = await call("plan_week", {
    entries: [
      { date: MON, slot: "petit_dej", recipe_code: "ZPT1" },
      { date: TUE, slot: "dejeuner", recipe_code: "ZZNOPE" },
    ],
  });
  check(
    "plan_week avec code inconnu → erreur métier citant ZZNOPE",
    r.isError && String(r.data.error).includes("ZZNOPE")
  );
  const after = await rest(
    "GET",
    `meal_plan_entries?plan_date=gte.${MON}&plan_date=lte.${SUN}&select=id,plan_date,slot`
  );
  check(
    "atomicité : rien n'a été écrit (même l'entrée valide du lot)",
    after.length === before.length &&
      !after.some((e) => e.plan_date === MON && e.slot === "petit_dej")
  );

  // --- 3. plan_week valide : 3 entrées, totaux/jour vs calcul indépendant ---
  r = await call("plan_week", {
    entries: [
      { date: MON, slot: "dejeuner", recipe_code: "ZPT1" }, // remplace ZPT2 ×1.5
      { date: MON, slot: "diner", recipe_code: "ZPT2", portion_factor: 1.5 },
      { date: TUE, slot: "dejeuner", recipe_code: "ZPT1", portion_factor: 1.25 },
    ],
  });
  // Calcul indépendant : lundi = 600×1 + 500×1.5 ; mardi = 600×1.25
  const MON_KCAL = 600 + 750; // 1350
  const MON_P = 45 + 60; // 105
  const TUE_KCAL = 750;
  const TUE_P = 56.3; // 45 × 1.25 = 56.25 → 56.3 (0,1 g)
  const dayMon = r.data.days?.find((d) => d.date === MON);
  const dayTue = r.data.days?.find((d) => d.date === TUE);
  check(
    `plan_week : lundi ${MON_KCAL} kcal / ${MON_P} P (calcul indépendant)`,
    !r.isError && dayMon?.totals.kcal === MON_KCAL && Number(dayMon?.totals.protein_g) === MON_P
  );
  check(
    `plan_week : mardi ${TUE_KCAL} kcal / ${TUE_P} P (portion 1.25, arrondi 0,1 g)`,
    dayTue?.totals.kcal === TUE_KCAL && Number(dayTue?.totals.protein_g) === TUE_P
  );
  check(
    "plan_week : delta kcal lundi = -920, hors ±5%",
    dayMon?.delta_vs_targets.kcal === 1350 - 2270 && dayMon?.within_5pct_kcal === false
  );
  check(
    "plan_week : compteurs Alan (poisson=2, legumineuses=1)",
    r.data.alan_counters?.find((c) => c.tag === "poisson")?.count === 2 &&
      r.data.alan_counters?.find((c) => c.tag === "legumineuses")?.count === 1
  );

  // --- 4. get_plan : relit le même état ---
  r = await call("get_plan", { start_date: MON, end_date: SUN });
  const entriesCount = r.data.days?.reduce((s, d) => s + d.entries.length, 0);
  check(
    "get_plan : 3 entrées sur 2 jours, cibles jointes",
    !r.isError && entriesCount === 3 && r.data.days.length === 2 && r.data.targets.kcal === 2270
  );

  // --- 5. get_shopping_list : cas connu (agrégation bout en bout) ---
  // riz (g, partagé) : 80×1 + 40×1.5 + 80×1.25 = 240 g — sommé
  // œufs (pièce)     : 2×1 + 2×1.25 = 4.5 pièce — non converti
  // tomate (pièce)   : 1×1.5 = 1.5 pièce — portion 1.5 appliquée
  r = await call("get_shopping_list", { start_date: MON, end_date: SUN });
  const item = (name, unit) =>
    r.data.items?.find((i) => i.item.toLowerCase() === name && i.unit === unit);
  const riz = item("riz basmati test", "g");
  const oeufs = item("œufs test", "pièce");
  const tomate = item("tomate test", "pièce");
  check(
    "courses : ingrédient partagé en g sommé (240 g, 2 recettes × portions)",
    riz?.qty === 240
  );
  check("courses : pièces non converties (œufs 4.5 pièce)", oeufs?.qty === 4.5);
  check("courses : portion 1.5 appliquée (tomate 1.5 pièce)", tomate?.qty === 1.5);
  check(
    "courses : rayon féculents pour le riz + version texte copiable",
    riz?.rayon === "féculents" &&
      r.data.text.toLowerCase().includes("riz basmati test : 240 g")
  );

  // --- 6. Flux "logger depuis le plan" (module partagé plan-log.mjs) ---
  const [planEntry] = await rest(
    "GET",
    `meal_plan_entries?plan_date=eq.${MON}&slot=eq.diner&select=plan_date,slot,portion_factor,recipe:recipes(id,kcal,protein_g,carbs_g,fat_g)`
  );
  const payload = mealLogFromPlan(planEntry);
  const [logged] = await rest("POST", "meal_logs", payload);
  // Calcul indépendant : ZPT2 ×1.5 → 750 kcal / 60 P / 75 G / 22.5 L
  check(
    "logger depuis le plan : meal_log = recette × portion du plan (750/60/75/22.5)",
    logged.kcal === 750 &&
      Number(logged.protein_g) === 60 &&
      Number(logged.carbs_g) === 75 &&
      Number(logged.fat_g) === 22.5 &&
      logged.log_date === MON &&
      logged.slot === "diner" &&
      logged.recipe_id === r2.id &&
      Number(logged.portion_factor) === 1.5
  );

  // --- 7. clear_plan : compte exact, base vidée ---
  r = await call("clear_plan", { start_date: MON, end_date: SUN });
  const leftPlan = await rest(
    "GET",
    `meal_plan_entries?plan_date=gte.${MON}&plan_date=lte.${SUN}&select=id`
  );
  check("clear_plan : deleted=3 et 0 entrée restante en base", r.data.deleted === 3 && leftPlan.length === 0);
} finally {
  await client.close();
  await cleanup();
}

// --- Nettoyage vérifié ---
const leftovers = await Promise.all([
  rest("GET", `meal_plan_entries?plan_date=gte.${MON}&plan_date=lte.${SUN}&select=id`),
  rest("GET", `meal_logs?log_date=gte.${MON}&log_date=lte.${SUN}&select=id`),
  rest("GET", `recipes?code=in.(ZPT1,ZPT2)&select=id`),
]);
check("nettoyage : zéro donnée de test restante", leftovers.every((l) => l.length === 0));

console.log(failures === 0 ? "  → tests plan : tous passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
