// Lot 14 — cible de poids par exercice via MCP (SDK officiel, bearer).
// Usage : MCP_URL=<.../api/mcp> MCP_SECRET=... node scripts/lot14-mcp-target.mjs
// Prouve : set_exercise_target pose une cible (+ note), list_exercises et
// get_exercise_history la renvoient, set_exercise_target(null) l'efface, et un
// exercice sans cible renvoie null sans erreur. Restaure la cible d'origine.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.MCP_URL;
const SECRET = process.env.MCP_SECRET;
if (!URL_ || !SECRET) {
  console.error("MCP_URL et MCP_SECRET requis dans l'env.");
  process.exit(2);
}
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
};

const client = new Client({ name: "verify-lot14", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { Authorization: `Bearer ${SECRET}` } },
  })
);
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { data: JSON.parse(res.content?.[0]?.text ?? "{}"), isError: Boolean(res.isError) };
};

let exName, orig;
try {
  // Un exercice réel du catalogue (le premier). On mémorise sa cible d'origine.
  const list = await call("list_exercises");
  const ex = (list.data.exercises ?? [])[0];
  if (!ex) throw new Error("catalogue d'exercices vide");
  exName = ex.name;
  orig = { w: ex.target_weight_kg ?? null, n: ex.target_weight_note ?? null };
  check("list_exercises expose target_weight_kg/target_weight_note",
    "target_weight_kg" in ex && "target_weight_note" in ex);

  // 1. Poser une cible + note.
  let r = await call("set_exercise_target", {
    exercise_name: exName,
    target_weight_kg: 67.5,
    target_weight_note: "+2.5kg, tu tapais le haut de fourchette",
  });
  check("set_exercise_target : cible 67.5 + note posée",
    Number(r.data.target_weight_kg) === 67.5 && /haut de fourchette/.test(r.data.target_weight_note || ""),
    JSON.stringify(r.data));

  // 2. list_exercises la renvoie.
  r = await call("list_exercises", { query: exName });
  const back = (r.data.exercises ?? []).find((e) => e.name === exName);
  check("list_exercises renvoie la cible posée (67.5)", back && Number(back.target_weight_kg) === 67.5);

  // 3. get_exercise_history la renvoie.
  r = await call("get_exercise_history", { exercise_name: exName, limit: 1 });
  check("get_exercise_history renvoie target_weight_kg=67.5", Number(r.data.exercise.target_weight_kg) === 67.5,
    JSON.stringify(r.data.exercise));

  // 4. null efface la cible ; un exo sans cible renvoie null sans erreur.
  r = await call("set_exercise_target", { exercise_name: exName, target_weight_kg: null });
  check("set_exercise_target(null) : cible effacée", r.data.target_weight_kg === null && !r.isError);
  r = await call("get_exercise_history", { exercise_name: exName, limit: 1 });
  check("exercice sans cible → target_weight_kg=null, pas d'erreur",
    r.data.exercise.target_weight_kg === null && !r.isError);
} finally {
  // Restauration de la cible d'origine (souvent null).
  if (exName) {
    await call("set_exercise_target", {
      exercise_name: exName,
      target_weight_kg: orig?.w ?? null,
      ...(orig?.n ? { target_weight_note: orig.n } : {}),
    }).catch(() => {});
  }
  await client.close();
}
console.log(failures === 0 ? "  → MCP cible de poids : tous les tests passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
