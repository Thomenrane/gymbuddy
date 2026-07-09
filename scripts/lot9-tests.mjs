// Tests Lot 9 (recettes sans code planifiables) : via HTTP bearer,
// assertions de contenu + vérifications en base. Une recette créée par
// add_recipe (donc SANS code) doit être planifiable et loggable par
// recipe_id. Nettoyage complet ; seed 32 + 4 recettes 'claude' intactes.
// Données de test : plan/logs en 1999, recettes préfixe __LOT9.
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

const D1 = "1999-09-06";
const D2 = "1999-09-07";
const D3 = "1999-09-08";
const BOGUS_ID = "00000000-0000-0000-0000-000000000000";
let failures = 0;
function check(label, cond, detail = "") {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
}

async function rest(method, path, body) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SRK, Authorization: `Bearer ${SRK}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
async function cleanup() {
  await rest("DELETE", `meal_plan_entries?plan_date=gte.${D1}&plan_date=lte.${D3}`);
  await rest("DELETE", `meal_logs?log_date=gte.${D1}&log_date=lte.${D3}`);
  await rest("DELETE", "recipes?name=like.__LOT9*");
}

await cleanup();

// Invariants AVANT : 32 seed, 4 claude, macros + code de PD1 (seed intact)
const claudeBefore = (await rest("GET", "recipes?source=eq.claude&select=id")).length;
const seedBefore = (await rest("GET", "recipes?source=neq.claude&select=id")).length;
const [pd1Before] = await rest("GET", "recipes?code=eq.PD1&select=code,kcal,protein_g,carbs_g,fat_g");
check(`état initial : ${seedBefore} seed, ${claudeBefore} claude`, seedBefore === 32);

const client = new Client({ name: "verify-lot9", version: "1.0.0" });
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
  // --- 1. add_recipe SANS code → code null ---
  let r = await call("add_recipe", {
    name: "__LOT9_NOCODE__", category: "dejeuner",
    kcal: 400, protein_g: 30, carbs_g: 40, fat_g: 10,
    ingredients: [{ item: "test", qty: 1, unit: "g" }],
  });
  const rid = r.data.id;
  check("add_recipe SANS code → créée avec code=null", !r.isError && Boolean(rid) && r.data.code === null);

  // --- 2. plan_week par recipe_id + get_plan relit avec macros ---
  r = await call("plan_week", { entries: [{ date: D1, slot: "dejeuner", recipe_id: rid }] });
  check("plan_week par recipe_id : succès", !r.isError);
  r = await call("get_plan", { start_date: D1, end_date: D3 });
  const day = r.data.days?.find((d) => d.date === D1);
  const entry = day?.entries?.[0];
  check(
    "get_plan relit l'entrée par recipe_id, macros du jour = recette (400 kcal / 30 P)",
    entry?.recipe_id === rid && day?.totals.kcal === 400 && Number(day?.totals.protein_g) === 30
  );

  // --- 3. plan_week avec recipe_id inconnu dans un lot valide → RIEN écrit ---
  r = await call("plan_week", {
    entries: [
      { date: D2, slot: "dejeuner", recipe_code: "PD1" }, // valide
      { date: D2, slot: "diner", recipe_id: BOGUS_ID },   // inconnu
    ],
  });
  check("plan_week recipe_id inconnu → erreur métier", r.isError && String(r.data.error).includes("Recettes inconnues"));
  const d2rows = await rest("GET", `meal_plan_entries?plan_date=eq.${D2}&select=id`);
  check("atomicité : rien écrit pour le lot invalide (même l'entrée PD1 valide)", d2rows.length === 0);

  // --- 4. log_meal par recipe_id : macros dénormalisées ×2 ---
  r = await call("log_meal", { date: D1, slot: "dejeuner", recipe_id: rid, portion_factor: 2 });
  check(
    "log_meal par recipe_id ×2 : 800 kcal / 60 P / 80 G / 20 L (figées)",
    !r.isError && r.data.kcal === 800 && Number(r.data.protein_g) === 60 &&
      Number(r.data.carbs_g) === 80 && Number(r.data.fat_g) === 20 && r.data.recipe_id === rid
  );

  // --- 5. add_recipe avec un code déjà pris (PD1) → erreur, rien écrit ---
  r = await call("add_recipe", {
    name: "__LOT9_DUP__", category: "dejeuner", code: "PD1",
    kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1,
    ingredients: [{ item: "test", qty: 1, unit: "g" }],
  });
  check("add_recipe code 'PD1' déjà pris → erreur métier explicite", r.isError && String(r.data.error).includes("déjà"));
  const dup = await rest("GET", "recipes?name=eq.__LOT9_DUP__&select=id");
  check("aucune recette écrite pour le doublon de code", dup.length === 0);

  // --- 6. update_recipe attribue un code, puis plan_week par ce code ---
  r = await call("update_recipe", { id: rid, code: "ZL9" });
  check("update_recipe : code 'ZL9' attribué à une recette qui n'en avait pas", !r.isError && r.data.code === "ZL9");
  r = await call("plan_week", { entries: [{ date: D3, slot: "dejeuner", recipe_code: "ZL9" }] });
  check("plan_week par le nouveau code 'ZL9' : succès", !r.isError);
  const d3rows = await rest("GET", `meal_plan_entries?plan_date=eq.${D3}&select=recipe_id`);
  check("entrée écrite pointe bien la recette de test", d3rows.length === 1 && d3rows[0].recipe_id === rid);

  // --- 7. recipe_code + recipe_id incohérents → erreur métier ---
  r = await call("plan_week", {
    entries: [{ date: D2, slot: "dejeuner", recipe_code: "D1", recipe_id: rid }], // rid = code ZL9, pas D1
  });
  check("code+id incohérents → erreur métier (Incohérence)", r.isError && String(r.data.error).includes("Incohérence"));

  // --- comportement existant : plan_week par code seul reste OK ---
  r = await call("plan_week", { entries: [{ date: D2, slot: "collation", recipe_code: "PD1" }] });
  check("régression : plan_week par recipe_code seul fonctionne toujours", !r.isError);
} finally {
  await client.close();
  await cleanup();
}

// --- Invariants APRÈS : seed 32 + code/macros PD1 intacts, 4 claude ---
const [pd1After] = await rest("GET", "recipes?code=eq.PD1&select=code,kcal,protein_g,carbs_g,fat_g");
const claudeAfter = (await rest("GET", "recipes?source=eq.claude&select=id")).length;
const seedAfter = (await rest("GET", "recipes?source=neq.claude&select=id")).length;
check(
  "seed PD1 intact (code + macros inchangés)",
  JSON.stringify(pd1After) === JSON.stringify(pd1Before)
);
check(
  `32 recettes seed + ${claudeBefore} recettes 'claude' intactes (aucune de test restante)`,
  seedAfter === 32 && claudeAfter === claudeBefore
);

const [planLeft, logLeft, recLeft] = await Promise.all([
  rest("GET", `meal_plan_entries?plan_date=gte.${D1}&plan_date=lte.${D3}&select=id`),
  rest("GET", `meal_logs?log_date=gte.${D1}&log_date=lte.${D3}&select=id`),
  rest("GET", "recipes?name=like.__LOT9*&select=id"),
]);
check("nettoyage : zéro donnée de test restante", planLeft.length === 0 && logLeft.length === 0 && recLeft.length === 0);

console.log(failures === 0 ? "  → tests lot 9 : tous passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
