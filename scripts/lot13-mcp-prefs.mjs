// Lot 13 — préférences alimentaires via MCP (SDK officiel, bearer).
// Usage : MCP_URL=<.../api/mcp> MCP_SECRET=... node scripts/lot13-mcp-prefs.mjs
// Prouve : get_food_preferences (toutes puis filtrées) ; add + delete d'une
// préférence de test ; get_partner_profile inclut les préférences de Sarah.
// Seed initial laissé intact.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.MCP_URL;
const SECRET = process.env.MCP_SECRET;
if (!URL_ || !SECRET) {
  console.error("MCP_URL et MCP_SECRET requis dans l'env.");
  process.exit(2);
}
const TEST = "__PREF_TEST__";
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
};

const client = new Client({ name: "verify-lot13", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { Authorization: `Bearer ${SECRET}` } },
  })
);
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { data: JSON.parse(res.content?.[0]?.text ?? "{}"), isError: Boolean(res.isError) };
};
const has = (list, person, label) =>
  (list ?? []).some((p) => p.person === person && p.label === label);

try {
  // Nettoyage préalable d'un éventuel reliquat de test.
  let all = await call("get_food_preferences");
  for (const p of (all.data.preferences ?? []).filter((x) => x.label === TEST))
    await call("delete_food_preference", { id: p.id });

  // 1. Toutes : les 3 préférences seed présentes.
  all = await call("get_food_preferences");
  check("get_food_preferences (toutes) : seed florian poisson blanc + thon, sarah beans",
    has(all.data.preferences, "florian", "poisson blanc") &&
    has(all.data.preferences, "florian", "thon") &&
    (all.data.preferences ?? []).some((p) => p.person === "sarah" && /beans/i.test(p.label)),
    JSON.stringify(all.data.preferences));

  // 2. Filtrées par personne.
  const fl = await call("get_food_preferences", { person: "florian" });
  check("get_food_preferences person=florian : 2 (poisson blanc, thon), aucune de Sarah",
    fl.data.count === 2 && (fl.data.preferences ?? []).every((p) => p.person === "florian"));
  const sa = await call("get_food_preferences", { person: "sarah" });
  check("get_food_preferences person=sarah : 1 (beans)",
    sa.data.count === 1 && sa.data.preferences[0].person === "sarah");

  // 3. add → présent → delete → seed intact.
  const created = await call("add_food_preference", { person: "florian", kind: "dislike", label: TEST });
  check("add_food_preference : créée avec id", Boolean(created.data.id) && created.data.label === TEST);
  const afterAdd = await call("get_food_preferences", { person: "florian" });
  check("préférence de test visible après ajout", has(afterAdd.data.preferences, "florian", TEST));
  const del = await call("delete_food_preference", { id: created.data.id });
  check("delete_food_preference : confirmé", del.data.deleted === true);
  const afterDel = await call("get_food_preferences", { person: "florian" });
  check("seed florian intact après suppression (2, sans test)",
    afterDel.data.count === 2 && !has(afterDel.data.preferences, "florian", TEST));

  // 4. get_partner_profile inclut les préférences de Sarah.
  const partner = await call("get_partner_profile");
  check("get_partner_profile : food_preferences de Sarah incluses (beans)",
    Array.isArray(partner.data.food_preferences) &&
    partner.data.food_preferences.some((p) => /beans/i.test(p.label)),
    JSON.stringify(partner.data.food_preferences));
} finally {
  await client.close();
}
console.log(failures === 0 ? "  → MCP préférences : tous les tests passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
