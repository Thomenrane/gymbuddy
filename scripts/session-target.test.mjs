// Prouve le module d'objectif de séance (src/lib/session-target.mjs) :
//  - l'objectif est ASSEMBLÉ (template + cible Claude + dernière perf), jamais
//    extrapolé
//  - charge qui monte → on repart en BAS de fourchette ; sinon on refait au
//    moins la dernière fois, CAPÉ au haut de fourchette
//  - assistance (poids négatif, AMENDEMENT 3) : MOINS d'aide = plus dur
//  - charge inconnue → pas de « PDC » menteur dans le libellé
//  - les lignes pré-remplies suivent exactement l'objectif
import {
  sessionTarget,
  formatTarget,
  targetRows,
} from "../src/lib/session-target.mjs";

let fail = 0;
const t = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fail = 1;
};
const label = (input) => formatTarget(sessionTarget(input));

// Cas réel du screenshot PO : Barbell Bench Press, template 4×4-6, cible
// Claude 67,5 kg, dernière perf 3×6 @ 67,5 → « vise 4×6 propres avant de
// monter ». L'objectif assemblé doit dire exactement ça.
const bench = {
  defaults: { sets: 4, repsMin: 4, repsMax: 6 },
  targetWeight: 67.5,
  last: { sets: [
    { reps: 6, weight_kg: 67.5 },
    { reps: 6, weight_kg: 67.5 },
    { reps: 6, weight_kg: 67.5 },
  ] },
};
t(`bench (cible = dernier poids) → « 4×6 @ 67.5 kg »`, label(bench) === "4×6 @ 67.5 kg", label(bench));

// La charge monte → on repart en BAS de fourchette (double progression).
const monte = { ...bench, targetWeight: 70 };
t(`charge qui monte → bas de fourchette « 4×4 @ 70 kg »`, label(monte) === "4×4 @ 70 kg", label(monte));

// Reps de la dernière fois AU-DESSUS du haut de fourchette → capées.
const cap = {
  defaults: { sets: 3, repsMin: 8, repsMax: 10 },
  targetWeight: null,
  last: { sets: [{ reps: 12, weight_kg: 40 }, { reps: 12, weight_kg: 40 }] },
};
t(`reps hors fourchette → capées au haut « 3×10 @ 40 kg »`, label(cap) === "3×10 @ 40 kg", label(cap));

// Séries hétérogènes (6/6/5) : la référence est le MAX — l'objectif est de
// tenir le haut sur TOUTES les séries, pas de valider la série ratée.
const hetero = {
  defaults: { sets: 3, repsMin: 4, repsMax: 6 },
  targetWeight: 60,
  last: { sets: [{ reps: 6, weight_kg: 60 }, { reps: 6, weight_kg: 60 }, { reps: 5, weight_kg: 60 }] },
};
t(`séries hétérogènes → vise le max « 3×6 @ 60 kg »`, label(hetero) === "3×6 @ 60 kg", label(hetero));

// Assistance (Pull-Ups du screenshot) : dernière 4×8 @ assist. 14, cible 14
// (stockée positive côté MCP) → même difficulté, on garde 8.
const pullups = {
  defaults: { sets: 4, repsMin: 6, repsMax: 8 },
  targetWeight: 14,
  last: { sets: Array.from({ length: 4 }, () => ({ reps: 8, weight_kg: -14 })) },
};
const pu = sessionTarget(pullups);
t(`assistance détectée depuis le signe de la dernière perf`, pu.assist === true);
t(`assistance : poids d'objectif toujours positif en interne`, pu.weight === 14);
t(`assistance stable → « 4×8 @ assist. 14 kg »`, label(pullups) === "4×8 @ assist. 14 kg", label(pullups));

// MOINS d'assistance = plus dur → on repart en bas de fourchette.
const pullupsDur = { ...pullups, targetWeight: 12 };
t(`assistance réduite → plus dur → « 4×6 @ assist. 12 kg »`, label(pullupsDur) === "4×6 @ assist. 12 kg", label(pullupsDur));

// Aucune cible Claude : on retombe sur la dernière perf.
const sansCible = {
  defaults: { sets: 3, repsMin: 8, repsMax: 12 },
  targetWeight: null,
  last: { sets: [{ reps: 10, weight_kg: 40 }] },
};
t(`sans cible Claude → dernière perf « 3×10 @ 40 kg »`, label(sansCible) === "3×10 @ 40 kg", label(sansCible));

// Aucun template (exercice ajouté à la volée) : nombre de séries = celui de la
// dernière perf, reps et poids repris tels quels.
const sansTemplate = {
  defaults: null,
  targetWeight: null,
  last: { sets: Array.from({ length: 4 }, () => ({ reps: 8, weight_kg: 60 })) },
};
t(`sans template → « 4×8 @ 60 kg » (séries = dernière perf)`, label(sansTemplate) === "4×8 @ 60 kg", label(sansTemplate));

// Template sans historique : bas de fourchette, charge inconnue → PAS de
// « PDC » menteur, juste « 3×8 ».
const neuf = { defaults: { sets: 3, repsMin: 8, repsMax: 12 }, targetWeight: null, last: null };
t(`exercice jamais fait → « 3×8 » sans charge inventée`, label(neuf) === "3×8", label(neuf));

// Poids du corps réel (weight_kg null en base) : même traitement, pas de
// charge dans le libellé — la ligne « Dernière » porte déjà « PDC ».
const pdc = {
  defaults: { sets: 3, repsMin: 10, repsMax: 15 },
  targetWeight: null,
  last: { sets: [{ reps: 15, weight_kg: null }] },
};
t(`poids du corps → « 3×15 » (charge absente du libellé)`, label(pdc) === "3×15", label(pdc));

// Rien du tout : aucun objectif à afficher, mais 3 lignes vides à remplir.
const vide = sessionTarget({});
t(`aucune donnée → pas de libellé d'objectif`, formatTarget(vide) === null);
t(`aucune donnée → 3 séries par défaut`, vide.sets === 3 && vide.reps === null && vide.weight === null);

// Les lignes pré-remplies suivent EXACTEMENT l'objectif.
const rows = targetRows(sessionTarget(bench));
t(`pré-remplissage : 4 lignes`, rows.length === 4);
t(`pré-remplissage : reps et poids de l'objectif`, rows.every((r) => r.reps === "6" && r.weight === "67.5"));
t(`pré-remplissage : RPE jamais pré-rempli (ressenti frais)`, rows.every((r) => r.rpe === ""));
const rowsVides = targetRows(vide);
t(`pré-remplissage sans objectif : lignes vides, aucun chiffre inventé`,
  rowsVides.length === 3 && rowsVides.every((r) => r.reps === "" && r.weight === ""));

// Robustesse : valeurs illisibles ou nulles ne cassent rien.
const sale = sessionTarget({
  defaults: { sets: null, repsMin: null, repsMax: null },
  targetWeight: "",
  last: { sets: [{ reps: null, weight_kg: null }] },
});
t(`données sales → objectif dégradé mais valide`, sale.sets === 1 && sale.reps === null && sale.weight === null);

console.log(fail === 0 ? "  → objectif de séance : tous passent" : "  → échecs");
process.exit(fail);
