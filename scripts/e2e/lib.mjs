// Harnais E2E partagé (Playwright + Chromium pré-installé).
// - REST service-role pour seeder/nettoyer les données de test
// - auth RÉELLE du navigateur : magic link généré côté admin puis
//   /auth/confirm pose les cookies (le vrai flux de l'app)
// - petit assert + emulation de swipe tactile
import { chromium } from "playwright";
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
export function summary(name) {
  console.log(failures === 0 ? `  → ${name} : tous passent` : `  → ${failures} échec(s)`);
  return failures === 0;
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
