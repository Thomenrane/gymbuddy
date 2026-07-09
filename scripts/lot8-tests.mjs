// Tests Lot 8 (retrait des compteurs Alan, poisson gras seul) : via HTTP
// bearer, assertions de contenu. get_summary/get_plan renvoient
// oily_fish_count et plus alan_counters ; le compte est juste sur un jeu
// connu (D2 + L6 = 2, sans saumon = 0). Vérifie aussi en base que
// poisson-gras est sur D2 et L6 et que les autres tags ne sont pas touchés.
// Données de test : plan en 1999, préfixe __LOT8. Seed jamais modifié.
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

const MON = "1999-08-02"; // lundi
const SUN = "1999-08-08";
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
  await rest("DELETE", `meal_plan_entries?plan_date=gte.${MON}&plan_date=lte.${SUN}`);
  await rest("DELETE", `meal_logs?log_date=gte.${MON}&log_date=lte.${SUN}`);
}

await cleanup();

// Inventaire des tags AVANT (les autres tags Alan ne doivent pas bouger)
async function tagCount(tag) {
  const rows = await rest("GET", `recipes?tags=cs.{${tag}}&select=code`);
  return rows.length;
}
const before = {
  poisson: await tagCount("poisson"),
  pates: await tagCount("pates"),
  hache: await tagCount("hache"),
  legumineuses: await tagCount("legumineuses"),
  poissonGras: await tagCount("poisson-gras"),
};

const client = new Client({ name: "verify-lot8", version: "1.0.0" });
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
  // --- 0. Tag poisson-gras présent sur D2 et L6 en base ---
  const og = await rest("GET", "recipes?code=in.(D2,L6)&select=code,tags&order=code");
  check(
    "poisson-gras présent sur D2 et L6 en base",
    og.length === 2 &&
      og[0].tags.includes("poisson-gras") &&
      og[1].tags.includes("poisson-gras")
  );

  // --- 1. get_summary : oily_fish_count, plus de alan_counters ---
  // Plan/logs de test avec D2 (poisson-gras) et L6 (poisson-gras) → 2
  await call("plan_week", {
    entries: [
      { date: MON, slot: "dejeuner", recipe_code: "L6" },
      { date: MON, slot: "diner", recipe_code: "D2" },
      { date: "1999-08-03", slot: "dejeuner", recipe_code: "PD1" }, // sans poisson-gras
    ],
  });
  // Loggue les mêmes repas pour get_summary
  await call("log_meal", { date: MON, slot: "dejeuner", recipe_code: "L6" });
  await call("log_meal", { date: MON, slot: "diner", recipe_code: "D2" });
  await call("log_meal", { date: "1999-08-03", slot: "dejeuner", recipe_code: "PD1" });

  let r = await call("get_summary", { start_date: MON, end_date: SUN });
  check(
    "get_summary : oily_fish_count=2, aucun champ alan_counters",
    !r.isError && r.data.oily_fish_count === 2 && r.data.alan_counters === undefined,
    JSON.stringify({ oily: r.data.oily_fish_count, alan: r.data.alan_counters })
  );

  // --- 2. get_plan : oily_fish_count=2, plus de alan_counters ---
  r = await call("get_plan", { start_date: MON, end_date: SUN });
  check(
    "get_plan : oily_fish_count=2, aucun champ alan_counters",
    !r.isError && r.data.oily_fish_count === 2 && r.data.alan_counters === undefined,
    JSON.stringify({ oily: r.data.oily_fish_count, alan: r.data.alan_counters })
  );

  // --- 3. plan_week renvoie aussi oily_fish_count ---
  check("plan_week/get_plan cohérents (oily_fish_count exposé)", typeof r.data.oily_fish_count === "number");

  // --- 4. Jeu SANS poisson gras → 0 ---
  await call("clear_plan", { start_date: MON, end_date: SUN });
  r = await call("plan_week", {
    entries: [
      { date: MON, slot: "dejeuner", recipe_code: "PD1" },
      { date: MON, slot: "diner", recipe_code: "D1" }, // pas de poisson-gras
    ],
  });
  check("plan sans saumon : oily_fish_count=0", !r.isError && r.data.oily_fish_count === 0);
} finally {
  await client.close();
  await cleanup();
}

// --- 5. Les autres tags Alan ne sont pas supprimés du seed ---
const after = {
  poisson: await tagCount("poisson"),
  pates: await tagCount("pates"),
  hache: await tagCount("hache"),
  legumineuses: await tagCount("legumineuses"),
  poissonGras: await tagCount("poisson-gras"),
};
check(
  `tags seed intacts : poisson ${after.poisson}, pates ${after.pates}, hache ${after.hache}, legumineuses ${after.legumineuses} (inchangés)`,
  after.poisson === before.poisson &&
    after.pates === before.pates &&
    after.hache === before.hache &&
    after.legumineuses === before.legumineuses
);

// --- Nettoyage vérifié ---
const [planLeft, logLeft] = await Promise.all([
  rest("GET", `meal_plan_entries?plan_date=gte.${MON}&plan_date=lte.${SUN}&select=id`),
  rest("GET", `meal_logs?log_date=gte.${MON}&log_date=lte.${SUN}&select=id`),
]);
check("nettoyage : zéro donnée de test restante", planLeft.length === 0 && logLeft.length === 0);

console.log(failures === 0 ? "  → tests lot 8 : tous passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
