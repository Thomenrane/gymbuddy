// Lot 12 — vérifie le RPE par série via le serveur MCP (SDK officiel, bearer).
// Usage : MCP_URL=<.../api/mcp> MCP_SECRET=... node scripts/lot12-mcp-rpe.mjs
// Prouve : log_workout stocke un rpe (8.5) ET accepte un set sans rpe (null) ;
// get_workouts et get_exercise_history renvoient le rpe (8.5 / null) ;
// update_workout remplaçant les sets préserve le rpe fourni (7). Nettoie tout.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.MCP_URL;
const SECRET = process.env.MCP_SECRET;
if (!URL_ || !SECRET) {
  console.error("MCP_URL et MCP_SECRET requis dans l'env.");
  process.exit(2);
}

const D = "1999-12-13";
const EXO = "__RPE_TEST_EXO__";
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
};

const client = new Client({ name: "verify-lot12", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { Authorization: `Bearer ${SECRET}` } },
  })
);
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { data: JSON.parse(res.content?.[0]?.text ?? "{}"), isError: Boolean(res.isError) };
};

const findExo = (w) => (w?.workout_sets ?? []).filter((s) => s.exercise?.name === EXO);

try {
  // Nettoyage préalable (au cas où un run précédent a laissé des données).
  let existing = await call("get_workouts", { start_date: D, end_date: D });
  for (const w of existing.data.workouts ?? []) await call("delete_workout", { id: w.id });

  // 1. log_workout : un set avec rpe 8.5, un set SANS rpe (doit rester null).
  let r = await call("log_workout", {
    date: D,
    type: "muscu",
    exercises: [
      { name: EXO, sets: [{ reps: 10, weight_kg: 50, rpe: 8.5 }, { reps: 10, weight_kg: 50 }] },
    ],
  });
  check("log_workout : 2 séries créées (rpe optionnel)", r.data.sets_created === 2, JSON.stringify(r.data).slice(0, 200));

  // 2. get_workouts : rpe 8.5 stocké sur la 1re série, null sur la 2e.
  r = await call("get_workouts", { start_date: D, end_date: D });
  const w = r.data.workouts?.[0];
  const sets = findExo(w).sort((a, b) => a.set_number - b.set_number);
  check("get_workouts : série 1 rpe=8.5", sets[0] && Number(sets[0].rpe) === 8.5, JSON.stringify(sets));
  check("get_workouts : série 2 rpe=null (set sans rpe valide)", sets[1] && sets[1].rpe === null);

  // 3. get_exercise_history : le rpe ressenti remonte pour l'analyse de Claude.
  r = await call("get_exercise_history", { exercise_name: EXO, limit: 5 });
  const hasRpe = (r.data.workouts ?? []).some((h) => (h.sets ?? []).some((s) => Number(s.rpe) === 8.5));
  check("get_exercise_history : rpe 8.5 présent", hasRpe, JSON.stringify(r.data.workouts));

  // 4. update_workout : remplacement des sets → le rpe fourni (7) est préservé.
  await call("update_workout", {
    id: w.id,
    exercises: [{ name: EXO, sets: [{ reps: 10, weight_kg: 50, rpe: 7 }] }],
  });
  r = await call("get_workouts", { start_date: D, end_date: D });
  const after = findExo(r.data.workouts?.[0]);
  check("update_workout : rpe 7 préservé après remplacement", after.length === 1 && Number(after[0].rpe) === 7, JSON.stringify(after));

  // Nettoyage.
  for (const wk of r.data.workouts ?? []) await call("delete_workout", { id: wk.id });
  const left = await call("get_workouts", { start_date: D, end_date: D });
  check("nettoyage : plus aucune séance de test", (left.data.workouts ?? []).length === 0);
} finally {
  await client.close();
}
console.log(failures === 0 ? "  → MCP RPE : tous les tests passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
