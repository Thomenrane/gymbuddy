// Prouve le module de brouillon de séance (src/lib/session-draft.mjs) :
//  - la progression compte les séries TOUCHÉES, pas les séries remplies
//    (depuis le Lot 19 elles arrivent pré-remplies : « remplie » = 12/12 dès
//    l'ouverture, donc inutilisable)
//  - un brouillon sans saisie n'est pas « reprenable » (fin du fantôme créé au
//    simple montage de l'écran)
//  - les brouillons de plus de 24 h sont purgés, les frais conservés
//  - le lien de reprise ramène sur la bonne séance (template / édition / vierge)
import {
  draftKeyOf,
  draftProgress,
  isResumable,
  purgeStale,
  sortedDrafts,
  resumeHref,
  DRAFT_TTL_MS,
} from "../src/lib/session-draft.mjs";

let fail = 0;
const t = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fail = 1;
};

// Clé : inchangée depuis le Lot 3 (un brouillon d'avant reste retrouvable).
t("clé template", draftKeyOf({ templateId: "T", date: "2026-09-02" }) === "gb-session-T-2026-09-02");
t("clé édition prioritaire", draftKeyOf({ editId: "W", templateId: "T", date: "2026-09-02" }) === "gb-session-W-2026-09-02");
t("clé séance vierge", draftKeyOf({ date: "2026-09-02" }) === "gb-session-vierge-2026-09-02");

// Progression : 12 séries pré-remplies, 5 réellement saisies.
const preRempli = (n, touched) =>
  Array.from({ length: n }, (_, i) => ({
    reps: "6",
    weight: "67.5",
    rpe: "",
    touched: i < touched,
  }));
const seance = [
  { name: "Bench", sets: preRempli(4, 4) },
  { name: "Pull-Ups", sets: preRempli(4, 1) },
  { name: "Rowing", sets: preRempli(4, 0) },
];
const prog = draftProgress(seance);
t(`séries touchées comptées, pas remplies (5/12)`, prog.done === 5 && prog.total === 12, JSON.stringify(prog));

// Une séance seulement ouverte (tout pré-rempli, rien touché) n'est PAS un
// brouillon à reprendre — c'est exactement le bug du fantôme.
const fantome = { exercises: [{ name: "Bench", sets: preRempli(4, 0) }] };
t("séance ouverte sans saisie → pas reprenable", isResumable(fantome) === false);
t("séance avec une série saisie → reprenable", isResumable({ exercises: [{ name: "Bench", sets: preRempli(4, 1) }] }) === true);
t("brouillon absent → pas reprenable", isResumable(null) === false);
t("brouillon sans exercice → pas reprenable", isResumable({ exercises: [] }) === false);

// Purge : 24 h.
const now = 1_800_000_000_000;
const index = {
  frais: { key: "frais", updatedAt: now - 60_000 },
  limite: { key: "limite", updatedAt: now - DRAFT_TTL_MS + 1000 },
  perime: { key: "perime", updatedAt: now - DRAFT_TTL_MS - 1000 },
  casse: { key: "casse" },
};
const purge = purgeStale(index, now);
t("brouillon frais conservé", Boolean(purge.frais));
t("brouillon de 23 h 59 conservé", Boolean(purge.limite));
t("brouillon de plus de 24 h purgé", purge.perime === undefined);
t("brouillon sans horodatage purgé", purge.casse === undefined);

// Tri : le plus récemment touché en premier.
const ordre = sortedDrafts({
  a: { key: "a", updatedAt: now - 5000 },
  b: { key: "b", updatedAt: now - 1000 },
}).map((d) => d.key);
t("tri du plus récent au plus ancien", ordre.join(",") === "b,a", ordre.join(","));

// Liens de reprise.
t("reprise depuis un template",
  resumeHref({ templateId: "T", date: "2026-09-02" }) === "/training/muscu?template=T&date=2026-09-02");
t("reprise d'une édition (prioritaire sur le template)",
  resumeHref({ editId: "W", templateId: "T", date: "2026-09-02" }) === "/training/muscu?edit=W&date=2026-09-02");
t("reprise d'une séance vierge",
  resumeHref({ templateId: null, editId: null, date: "2026-09-02" }) === "/training/muscu?date=2026-09-02");

console.log(fail === 0 ? "  → brouillons de séance : tous passent" : "  → échecs");
process.exit(fail);
