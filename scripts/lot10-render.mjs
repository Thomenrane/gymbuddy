// Test Lot 10 — rendu AUTHENTIFIÉ RÉEL de l'écran Aujourd'hui.
// On authentifie via l'admin Supabase (generateLink → token_hash), on
// laisse l'app poser les cookies elle-même (/auth/confirm), puis on
// récupère le HTML SSR et on ASSERTE la présence des éléments d'UI :
//   - widget de pesée (data-testid) — comble le trou de couverture du
//     verify-phase2 qui ne testait que l'upsert données
//   - un log avec recipe_id expose un accès recette (data-recipe-id) ;
//     un log libre (free_label) ne l'expose pas
// Puis on vérifie l'upsert body_metric (2 saisies même date = 1 ligne).
// Données de test en 1999, nettoyées.
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL;
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER = "thomenrane@gmail.com";
if (!BASE || !SB || !SRK) {
  console.error("BASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(2);
}

const D = "1999-10-11"; // date de test (<= aujourd'hui → acceptée par la page)
let failures = 0;
function check(label, cond, detail = "") {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
}

async function rest(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SRK, Authorization: `Bearer ${SRK}`,
      "Content-Type": "application/json", Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
async function cleanup() {
  await rest("DELETE", `meal_logs?log_date=eq.${D}`);
  await rest("DELETE", `body_metrics?metric_date=eq.${D}`);
}

await cleanup();

// --- Fixtures : un log recette (PD1) + un log libre, sur la date de test ---
const [pd1] = await rest("GET", "recipes?code=eq.PD1&select=id,kcal,protein_g,carbs_g,fat_g");
// Insertions séparées : PostgREST exige des clés uniformes en lot.
await rest("POST", "meal_logs", {
  log_date: D, slot: "petit_dej", recipe_id: pd1.id, portion_factor: 1,
  kcal: pd1.kcal, protein_g: pd1.protein_g, carbs_g: pd1.carbs_g, fat_g: pd1.fat_g,
});
await rest("POST", "meal_logs", {
  log_date: D, slot: "extra", free_label: "__LOT10_LIBRE__",
  kcal: 700, protein_g: 30, carbs_g: 70, fat_g: 30,
});

// --- Authentification : l'app pose les cookies via /auth/confirm ---
const admin = createClient(SB, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: OWNER,
});
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(2); }
const tokenHash = linkData.properties.hashed_token;

const confirmRes = await fetch(
  `${BASE}/auth/confirm?token_hash=${tokenHash}&type=magiclink`,
  { redirect: "manual" }
);
const setCookies = confirmRes.headers.getSetCookie?.() ?? [];
const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
check(
  `auth : /auth/confirm pose des cookies de session (redirect ${confirmRes.status})`,
  cookie.includes("auth-token") && (confirmRes.status === 307 || confirmRes.status === 302)
);

// --- Rendu authentifié de l'écran Aujourd'hui ---
const pageRes = await fetch(`${BASE}/?date=${D}`, { headers: { cookie } });
const html = await pageRes.text();
check("page Aujourd'hui rendue authentifiée (200, pas de redirect login)", pageRes.status === 200 && !html.includes("Lien de connexion"));

// 1. Widget de pesée présent dans le DOM rendu (pas juste une route data)
check('widget de pesée présent (data-testid="weight-widget")', html.includes('data-testid="weight-widget"'));
check("widget de pesée : libellé de pesée présent", html.includes("Se peser") || /kg/.test(html));

// 2. Accès recette : le log recette porte data-recipe-id, pas le log libre
const recipeMarkers = (html.match(/data-recipe-id="[0-9a-f-]{36}"/g) ?? []);
check(
  "log avec recipe_id : accès recette exposé (data-recipe-id sur la ligne)",
  html.includes(`data-recipe-id="${pd1.id}"`)
);
check("log libre présent à l'écran", html.includes("__LOT10_LIBRE__"));
check(
  "log libre : AUCUN accès recette (un seul data-recipe-id, celui du log recette)",
  recipeMarkers.length === 1
);

// --- 3. Upsert body_metric : 2 saisies même date = 1 ligne, dernière gagne ---
const UPS = { Prefer: "resolution=merge-duplicates,return=representation" };
await rest("POST", "body_metrics?on_conflict=metric_date", { metric_date: D, weight_kg: 83.0 }, UPS);
await rest("POST", "body_metrics?on_conflict=metric_date", { metric_date: D, weight_kg: 82.4, waist_cm: 87 }, UPS);
const rows = await rest("GET", `body_metrics?metric_date=eq.${D}&select=weight_kg,waist_cm`);
check(
  "upsert pesée : 1 seule ligne, dernière valeur (82.4 kg, taille 87)",
  rows.length === 1 && Number(rows[0].weight_kg) === 82.4 && Number(rows[0].waist_cm) === 87
);

await cleanup();
const left = await rest("GET", `meal_logs?log_date=eq.${D}&select=id`);
const leftBm = await rest("GET", `body_metrics?metric_date=eq.${D}&select=id`);
check("nettoyage : zéro donnée de test restante", left.length === 0 && leftBm.length === 0);

console.log(failures === 0 ? "  → rendu lot 10 : tous passent" : `  → ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
