// Lot 26 — la cible de poids est SIGNÉE (négatif = assistance), via MCP réel.
// Usage : MCP_URL=<.../api/mcp> MCP_SECRET=... node scripts/lot26-mcp-sign.mjs
//
// Prouve, sur un exercice RÉELLEMENT assisté du catalogue :
//   - une cible POSITIVE est refusée (c'est le bug du Lot 26 : elle serait lue
//     comme un lest et pré-remplirait l'écran séance à l'envers) ;
//   - une cible NÉGATIVE est acceptée et relue telle quelle ;
//   - une cible 0 est refusée (elle ne veut rien dire) ;
//   - sur un exercice chargé, le positif reste évidemment accepté.
// La cible d'origine est restaurée dans tous les cas.
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

const client = new Client({ name: "verify-lot26", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { Authorization: `Bearer ${SECRET}` } },
  })
);
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "{}";
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { data, text, isError: Boolean(res.isError) };
};

/**
 * Séries chargées d'un exercice : toutes négatives = exercice assisté.
 * Forme réelle de get_exercise_history : { exercise, workouts:[{ sets:[…] }] }.
 */
const loadedSigns = (data) =>
  (data?.workouts ?? [])
    .flatMap((w) => w.sets ?? [])
    .map((s) => Number(s.weight_kg))
    .filter((n) => Number.isFinite(n) && n !== 0);

let assisted, loadedEx, orig;
try {
  const list = await call("list_exercises");
  const all = list.data.exercises ?? [];
  check("catalogue lisible", all.length > 0, String(all.length));

  // Découverte plutôt que nom en dur : le contrat ne doit pas dépendre du
  // catalogue d'un utilisateur précis.
  let seenLoaded = 0;
  for (const ex of all) {
    const h = await call("get_exercise_history", { exercise_name: ex.name, limit: 50 });
    const signs = loadedSigns(h.data);
    seenLoaded += signs.length;
    if (signs.length === 0) continue;
    if (!assisted && signs.every((n) => n < 0)) assisted = ex;
    if (!loadedEx && signs.every((n) => n > 0)) loadedEx = ex;
    if (assisted && loadedEx) break;
  }

  // Sans ce contrôle, une forme de retour mal lue donnerait « aucune série
  // chargée » partout, donc « aucun exercice assisté », donc un vert obtenu
  // sans avoir rien exercé. Le silence n'est pas un succès.
  check(
    "l'historique est réellement lu (séries chargées trouvées)",
    seenLoaded > 0,
    `${seenLoaded} série(s) chargée(s) vues`
  );

  if (!assisted) {
    check(
      "un exercice assisté existe pour exercer le garde-fou",
      false,
      "aucun exercice à historique 100 % négatif dans le catalogue"
    );
  } else {
    orig = { name: assisted.name, w: assisted.target_weight_kg ?? null };
    console.log(`  ..   exercice assisté détecté : ${assisted.name}`);

    let r = await call("set_exercise_target", {
      exercise_name: assisted.name,
      target_weight_kg: 14,
    });
    check(
      "cible POSITIVE refusée sur un exercice assisté",
      r.isError && /assist/i.test(r.text),
      r.text.slice(0, 160)
    );
    check("le refus dit quoi écrire (-14)", /-14/.test(r.text), r.text.slice(0, 160));

    r = await call("set_exercise_target", {
      exercise_name: assisted.name,
      target_weight_kg: -12,
      target_weight_note: "Lot 26 — vérification du signe",
    });
    check(
      "cible NÉGATIVE acceptée et relue telle quelle",
      !r.isError && Number(r.data.target_weight_kg) === -12,
      r.text.slice(0, 160)
    );

    r = await call("get_exercise_history", { exercise_name: assisted.name, limit: 1 });
    check(
      "get_exercise_history renvoie la cible signée",
      Number(r.data.exercise?.target_weight_kg) === -12,
      JSON.stringify(r.data.exercise)
    );

    r = await call("set_exercise_target", { exercise_name: assisted.name, target_weight_kg: 0 });
    check("cible 0 refusée", r.isError, r.text.slice(0, 120));
  }

  if (loadedEx) {
    const back = { name: loadedEx.name, w: loadedEx.target_weight_kg ?? null };
    const r = await call("set_exercise_target", {
      exercise_name: loadedEx.name,
      target_weight_kg: 42.5,
    });
    check(
      "cible positive TOUJOURS acceptée sur un exercice chargé",
      !r.isError && Number(r.data.target_weight_kg) === 42.5,
      r.text.slice(0, 160)
    );
    await call("set_exercise_target", {
      exercise_name: back.name,
      target_weight_kg: back.w,
    }).catch(() => {});
  }
} finally {
  // Restauration VÉRIFIÉE : un `.catch(() => {})` silencieux laisserait la
  // cible réelle du PO à -12. Si la valeur d'origine était positive (base pas
  // encore migrée), le nouveau garde-fou la refuse — il faut le dire, pas le
  // manger.
  if (orig) {
    await call("set_exercise_target", {
      exercise_name: orig.name,
      target_weight_kg: orig.w,
    }).catch(() => {});
    const after = await call("get_exercise_history", { exercise_name: orig.name, limit: 1 })
      .catch(() => ({ data: {} }));
    const back = after.data.exercise?.target_weight_kg ?? null;
    const same = back == null ? orig.w == null : Number(back) === Number(orig.w);
    check(`cible d'origine restaurée sur ${orig.name} (${orig.w})`, same, `en base : ${back}`);
  }
  await client.close();
}
console.log(failures === 0 ? "  → signe de la cible : tous les tests passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
