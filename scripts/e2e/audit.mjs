// Audit UI (Playwright) : pour CHAQUE écran du PRD, vérifie que ses
// éléments clés sont réellement RENDUS (pas seulement leur route data).
// But : débusquer d'autres cas « spécifié mais pas rendu » (comme l'était
// la pesée). Auth réelle, lecture seule (aucune donnée de test écrite).
import { authedBrowser, BASE, check, summary } from "./lib.mjs";

const { browser, page } = await authedBrowser();

async function screen(path, label) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => null);
  const ok = res && res.status() === 200 && !page.url().includes("/login");
  check(`${label} (${path}) : rendu authentifié 200`, Boolean(ok));
  return page.content();
}
const has = (html, needle, label) => check(`  ${label}`, html.includes(needle), `manque : ${needle}`);
const hasRe = (html, re, label) => check(`  ${label}`, re.test(html), `manque : ${re}`);

try {
  // 1. Aujourd'hui
  let html = await screen("/", "Aujourd'hui");
  has(html, 'data-testid="weight-widget"', "widget pesée");
  has(html, "Ajouter", "boutons d'ajout de repas");
  hasRe(html, /kcal/, "résumé macros (kcal)");

  // 2. Training
  html = await screen("/training", "Training");
  has(html, ">Training<", "titre Training");
  has(html, "/training/templates", "accès aux templates");

  // 3. Recettes
  html = await screen("/recettes", "Recettes");
  has(html, "Rechercher une recette", "champ de recherche");
  hasRe(html, /\/recettes\/[0-9a-f]{8}-/, "au moins une fiche recette (carte)");
  has(html, "/recettes/new", "bouton nouvelle recette");

  // 4. Tendances — les 6 visualisations du §4
  html = await screen("/tendances", "Tendances");
  for (const [needle, l] of [
    [">Poids<", "viz Poids"],
    ["Progression des charges", "viz Progression des charges"],
    ["Moyennes vs cibles", "viz Moyennes 7j/30j"],
    ["poisson gras", "viz Poisson gras (ex-Alan)"],
    ["Séances par semaine", "viz Séances/semaine"],
    ["Tour de taille", "viz Tour de taille"],
  ]) has(html, needle, l);

  // 5. Réglages
  html = await screen("/reglages", "Réglages");
  has(html, ">Réglages", "titre Réglages");
  has(html, "/api/mcp", "URL du connecteur MCP affichée");
  hasRe(html, /2270|kcal/, "édition des cibles");

  // 6. Plan
  html = await screen("/plan", "Plan");
  has(html, ">Plan<", "titre Plan");
  has(html, "/plan/courses", "accès Liste de courses");
  has(html, "poisson gras", "compteur poisson gras");

  // 7. Liste de courses
  html = await screen("/plan/courses", "Liste de courses");
  hasRe(html, /[Cc]ourses/, "écran Liste de courses");
} finally {
  await browser.close();
}
process.exit(summary("Audit UI") ? 0 : 1);
