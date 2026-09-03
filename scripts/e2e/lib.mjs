// Harnais E2E partagé (Playwright + Chromium pré-installé).
// - REST service-role pour seeder/nettoyer les données de test
// - auth RÉELLE du navigateur : magic link généré côté admin puis
//   /auth/confirm pose les cookies (le vrai flux de l'app)
// - petit assert + emulation de swipe tactile
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

export const CHROMIUM = "/opt/pw-browsers/chromium";
export const OWNER = "thomenrane@gmail.com";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const BASE = process.env.BASE_URL || "http://localhost:3221";

if (!SB || !SRK) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(2);
}

let failures = 0;
export function check(label, cond, detail = "") {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
  return cond;
}
/**
 * Fin de suite : imprime le bilan ET SORT EN ERREUR s'il y a des échecs.
 *
 * Cette fonction se contentait de `return failures === 0` — que personne
 * n'utilisait. Résultat : une suite DOM pouvait afficher « FAIL » sur dix
 * assertions et sortir avec le code 0, donc le contrat qui l'appelle la voyait
 * verte. Seule une EXCEPTION la faisait tomber. Tout le volet DOM des contrats
 * était donc décoratif : il montrait les échecs sans jamais les faire compter.
 */
export function summary(name) {
  console.log(failures === 0 ? `  → ${name} : tous passent` : `  → ${failures} échec(s)`);
  if (failures > 0) process.exit(1);
  return true;
}

export async function rest(method, path, body) {
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

/**
 * Supprime des lignes par NOM EXACT. À utiliser pour tout nettoyage de données
 * de test — jamais un motif.
 *
 * `name=like.__FOO_%` ne nettoie RIEN : en SQL LIKE les « _ » sont des jokers
 * d'un caractère et le « % » final est pris au pied de la lettre. Le motif ne
 * matche donc jamais rien, et l'échec est silencieux — des templates de test
 * `is_active` sont restés en base et apparaissaient dans « Nouvelle séance ».
 * Un motif trop large serait pire encore : il effacerait de vraies données.
 */
export async function deleteByNames(table, names) {
  for (const name of names) {
    try {
      await rest("DELETE", `${table}?name=eq.${encodeURIComponent(name)}`);
    } catch (e) {
      // Visible plutôt que silencieux : un nettoyage qui échoue doit se voir.
      console.log(`  ~~ nettoyage ${table} « ${name} » : ${String(e.message).slice(0, 120)}`);
    }
  }
}

/** Lance un navigateur + un contexte mobile tactile AUTHENTIFIÉ. */
export async function authedBrowser() {
  const admin = createClient(SB, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER });
  if (error) throw new Error(`generateLink: ${error.message}`);
  const tokenHash = data.properties.hashed_token;

  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 12/13 logique
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  // L'app pose elle-même les cookies de session via /auth/confirm.
  await page.goto(`${BASE}/auth/confirm?token_hash=${tokenHash}&type=magiclink`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
  return { browser, context, page };
}

/** Émule un swipe horizontal tactile sur un élément (React onTouch*). */
export async function swipe(page, selector, dx, dy = 0) {
  await page.locator(selector).first().evaluate((el, { dx, dy }) => {
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const mk = (x, y) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      return { touches: [t], changedTouches: [t], targetTouches: [t] };
    };
    const fire = (type, x, y) =>
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, ...mk(x, y) }));
    fire("touchstart", x0, y0);
    // quelques pas intermédiaires pour déclencher la détection d'axe
    for (let i = 1; i <= 4; i++) fire("touchmove", x0 + (dx * i) / 4, y0 + (dy * i) / 4);
    fire("touchend", x0 + dx, y0 + dy);
  }, { dx, dy });
}

/**
 * Lot 27 : depuis que la séance en cours vit en base, OUVRIR l'écran séance
 * crée une ligne « En cours » — y compris dans un test. Elle n'est effacée que
 * par « Terminer » ou « Abandonner », donc un test qui ouvre puis s'arrête
 * laisse un brouillon dans la vraie base, visible dans l'onglet Training du PO.
 * (C'est arrivé : 4 lignes fantômes après une passe de contrats.)
 *
 * On ne peut pas nettoyer par nom : un brouillon porte le titre du TEMPLATE, y
 * compris un template réel du PO, et il peut y avoir une séance réellement en
 * cours. On note donc les ids AVANT, et on ne supprime que le DELTA.
 */
export async function draftIdsNow() {
  const rows = await rest("GET", "/workout_drafts?select=id");
  return new Set((rows ?? []).map((r) => r.id));
}

/** Supprime les brouillons apparus depuis `before` — et le dit si ça échoue. */
export async function cleanupNewDrafts(before) {
  let after;
  try {
    after = await rest("GET", "/workout_drafts?select=id");
  } catch (e) {
    console.log(`  ~~ nettoyage brouillons : lecture impossible (${String(e.message).slice(0, 100)})`);
    return;
  }
  const created = (after ?? []).map((r) => r.id).filter((id) => !before.has(id));
  for (const id of created) {
    try {
      await rest("DELETE", `/workout_drafts?id=eq.${id}`);
    } catch (e) {
      console.log(`  ~~ nettoyage brouillon ${id} : ${String(e.message).slice(0, 100)}`);
    }
  }
  if (created.length) console.log(`  ..   ${created.length} brouillon(s) de test nettoyé(s)`);
}
