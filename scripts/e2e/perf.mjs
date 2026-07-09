// Mesure de perf réelle (Playwright) : timings de navigation entre onglets
// + croissance du heap JS sur N navigations (détection de fuite mémoire).
// NB : la latence absolue est faussée par le proxy du sandbox ; ce qui est
// significatif = la CROISSANCE du heap (fuite) et le timing RELATIF
// cache-froid vs cache-chaud (effet staleTimes).
import { authedBrowser, BASE, check, summary } from "./lib.mjs";

const TABS = ["/", "/training", "/recettes", "/tendances"];
const heap = (page) =>
  page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));

const { browser, context, page } = await authedBrowser();
const cdp = await context.newCDPSession(page);
const gcHeap = async () => {
  await cdp.send("HeapProfiler.collectGarbage"); // GC forcé → retained heap réel
  return page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
};
try {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  // --- Timings de navigation (clic barre d'onglets → contenu visible) ---
  const timings = {};
  for (let round = 0; round < 3; round++) {
    for (const tab of TABS) {
      const t0 = Date.now();
      await page.goto(`${BASE}${tab}`, { waitUntil: "networkidle" });
      await page.locator("main, h1").first().waitFor({ state: "visible", timeout: 10000 });
      const dt = Date.now() - t0;
      (timings[tab] ??= []).push(dt);
    }
  }
  console.log("  Navigation (ms, 3 tours) :");
  for (const tab of TABS) {
    const a = timings[tab];
    const avg = Math.round(a.reduce((s, x) => s + x, 0) / a.length);
    console.log(`    ${tab.padEnd(12)} ${a.map((x) => `${x}`.padStart(4)).join(" ")}  moy ${avg}`);
  }

  // --- Navigation CLIQUÉE (barre d'onglets = navigation client) ---
  // Première visite (cache froid) vs revisite (cache chaud staleTimes).
  const navClick = async (href) => {
    const t0 = Date.now();
    await page.locator(`nav a[href="${href}"]`).click();
    await page.waitForURL(`**${href === "/" ? "/" : href}`, { timeout: 10000 }).catch(() => {});
    await page.locator("h1, main").first().waitFor({ state: "visible", timeout: 10000 });
    return Date.now() - t0;
  };
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const cold = { training: await navClick("/training"), recettes: await navClick("/recettes") };
  await navClick("/"); // retour accueil
  // revisites (arbres déjà en cache client < 30 s)
  const warm = { training: await navClick("/training"), recettes: await navClick("/recettes") };
  console.log("  Navigation cliquée (ms) :");
  console.log(`    training  froid ${cold.training}  → chaud ${warm.training}`);
  console.log(`    recettes  froid ${cold.recettes}  → chaud ${warm.recettes}`);

  // --- Heap RETENU (GC forcé) sur 20 navigations (fuite ?) ---
  if (await heap(page)) {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const h0 = await gcHeap();
    for (let i = 0; i < 20; i++) {
      await page.goto(`${BASE}${TABS[i % TABS.length]}`, { waitUntil: "networkidle" });
    }
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const h1 = await gcHeap(); // GC forcé → mémoire réellement retenue
    const mb = (b) => (b / 1024 / 1024).toFixed(1);
    const growthPct = ((h1 - h0) / h0) * 100;
    console.log(`  Heap retenu (GC forcé) : départ ${mb(h0)} Mo → après 20 nav ${mb(h1)} Mo (${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(0)} %)`);
    check(
      `pas de fuite mémoire (heap retenu stable, ${mb(h1)} Mo)`,
      h1 < 90 * 1024 * 1024 && growthPct < 50
    );
  } else {
    console.log("  (performance.memory indisponible — heap non mesuré)");
  }
} finally {
  await browser.close();
}
process.exit(summary("Perf") ? 0 : 1);
