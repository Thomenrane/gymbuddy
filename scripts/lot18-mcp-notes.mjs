// Lot 18 — vérifie la note PAR EXERCICE via le serveur MCP (SDK officiel, bearer).
// Usage : MCP_URL=<.../api/mcp> MCP_SECRET=... node scripts/lot18-mcp-notes.mjs
// Prouve : log_workout enregistre une note sur UN exercice précis et pas sur les
// autres ; get_workouts et get_exercise_history la renvoient attachée au bon
// exercice (null ailleurs) ; update_workout la préserve si omise, la remplace si
// fournie, l'efface si null ; la note de séance globale (workouts.notes) reste
// fonctionnelle et distincte. Nettoie tout.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.MCP_URL;
const SECRET = process.env.MCP_SECRET;
if (!URL_ || !SECRET) {
  console.error("MCP_URL et MCP_SECRET requis dans l'env.");
  process.exit(2);
}

const D = "1999-12-18";
const PULLUPS = "__NOTE_TEST_PULLUPS__";
const DIPS = "__NOTE_TEST_DIPS__";
const NOTE = "assistance -14 pour tenir propre";
const GLOBAL = "note de séance globale (sommeil moyen)";
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
};

const client = new Client({ name: "verify-lot18", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { Authorization: `Bearer ${SECRET}` } },
  })
);
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { data: JSON.parse(res.content?.[0]?.text ?? "{}"), isError: Boolean(res.isError) };
};
const noteFor = (w, exo) =>
  (w?.exercise_notes ?? []).find((n) => n.exercise?.name === exo)?.note ?? null;

try {
  // Nettoyage préalable.
  let existing = await call("get_workouts", { start_date: D, end_date: D });
  for (const w of existing.data.workouts ?? []) await call("delete_workout", { id: w.id });

  // 1. log_workout : note sur PULLUPS uniquement, note de séance globale à part.
  let r = await call("log_workout", {
    date: D,
    type: "muscu",
    notes: GLOBAL,
    exercises: [
      { name: PULLUPS, note: NOTE, sets: [{ reps: 8, weight_kg: -14 }, { reps: 7, weight_kg: -14 }] },
      { name: DIPS, sets: [{ reps: 10, weight_kg: null }] },
    ],
  });
  check("log_workout : séance créée (3 séries)", r.data.sets_created === 3, JSON.stringify(r.data).slice(0, 200));

  // 2. get_workouts : note attachée au BON exercice, pas aux autres ; la note
  //    de séance globale reste distincte.
  r = await call("get_workouts", { start_date: D, end_date: D });
  const w = r.data.workouts?.[0];
  check("get_workouts : note présente sur l'exo noté", noteFor(w, PULLUPS) === NOTE, JSON.stringify(w?.exercise_notes));
  check("get_workouts : PAS de note sur l'autre exo", noteFor(w, DIPS) === null);
  check("get_workouts : note de séance globale intacte et distincte", w?.notes === GLOBAL, String(w?.notes));

  // 3. get_exercise_history : la note voyage avec l'exercice.
  r = await call("get_exercise_history", { exercise_name: PULLUPS, limit: 5 });
  const h = (r.data.workouts ?? []).find((x) => x.workout_date === D);
  check("get_exercise_history : exercise_note au bon endroit", h?.exercise_note === NOTE, JSON.stringify(h));
  r = await call("get_exercise_history", { exercise_name: DIPS, limit: 5 });
  const hd = (r.data.workouts ?? []).find((x) => x.workout_date === D);
  check("get_exercise_history : exercise_note=null pour l'exo sans note", hd != null && hd.exercise_note === null, JSON.stringify(hd));

  // 4. update_workout (remplacement des sets) : note OMISE → préservée.
  await call("update_workout", {
    id: w.id,
    exercises: [
      { name: PULLUPS, sets: [{ reps: 9, weight_kg: -14 }] },
      { name: DIPS, sets: [{ reps: 11, weight_kg: null }] },
    ],
  });
  r = await call("get_workouts", { start_date: D, end_date: D });
  check("update_workout : note préservée quand omise", noteFor(r.data.workouts?.[0], PULLUPS) === NOTE, JSON.stringify(r.data.workouts?.[0]?.exercise_notes));

  // 5. update_workout : note FOURNIE → remplacée (et ajout sur l'autre exo).
  await call("update_workout", {
    id: w.id,
    exercises: [
      { name: PULLUPS, note: "passé à -12, propre", sets: [{ reps: 9, weight_kg: -12 }] },
      { name: DIPS, note: "gêne au poignet", sets: [{ reps: 11, weight_kg: null }] },
    ],
  });
  r = await call("get_workouts", { start_date: D, end_date: D });
  check("update_workout : note remplacée", noteFor(r.data.workouts?.[0], PULLUPS) === "passé à -12, propre");
  check("update_workout : note ajoutée sur l'autre exo", noteFor(r.data.workouts?.[0], DIPS) === "gêne au poignet");

  // 6. update_workout : note null → effacée ; la note de séance globale survit.
  await call("update_workout", {
    id: w.id,
    exercises: [
      { name: PULLUPS, note: null, sets: [{ reps: 9, weight_kg: -12 }] },
      { name: DIPS, sets: [{ reps: 11, weight_kg: null }] },
    ],
  });
  r = await call("get_workouts", { start_date: D, end_date: D });
  check("update_workout : note effacée avec null", noteFor(r.data.workouts?.[0], PULLUPS) === null, JSON.stringify(r.data.workouts?.[0]?.exercise_notes));
  check("update_workout : note omise toujours préservée", noteFor(r.data.workouts?.[0], DIPS) === "gêne au poignet");
  check("workouts.notes (globale) toujours intacte", r.data.workouts?.[0]?.notes === GLOBAL);

  // Nettoyage.
  for (const wk of r.data.workouts ?? []) await call("delete_workout", { id: wk.id });
  const left = await call("get_workouts", { start_date: D, end_date: D });
  check("nettoyage : plus aucune séance de test", (left.data.workouts ?? []).length === 0);
} finally {
  await client.close();
}
console.log(failures === 0 ? "  → MCP notes par exercice : tous les tests passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
