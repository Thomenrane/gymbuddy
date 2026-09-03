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

// Échauffement en pyramide : l'objectif doit porter sur la SÉRIE DE TRAVAIL.
// Mélanger le poids d'une série et les reps d'une autre fabriquerait « 8 @ 60 »,
// une combinaison jamais réalisée, en contradiction avec la ligne « Dernière ».
const pyramide = {
  defaults: { sets: 3, repsMin: 4, repsMax: 8 },
  targetWeight: null,
  last: { sets: [
    { reps: 8, weight_kg: 60 },
    { reps: 6, weight_kg: 70 },
    { reps: 4, weight_kg: 80 },
  ] },
};
t(`échauffement en pyramide → série de travail « 3×4 @ 80 kg »`, label(pyramide) === "3×4 @ 80 kg", label(pyramide));

// Séries de travail égales avec un échauffement plus léger devant.
const echauffement = {
  defaults: { sets: 3, repsMin: 4, repsMax: 6 },
  targetWeight: null,
  last: { sets: [
    { reps: 10, weight_kg: 40 },
    { reps: 6, weight_kg: 67.5 },
    { reps: 5, weight_kg: 67.5 },
  ] },
};
t(`reps prises à la charge de travail, pas à l'échauffement`, label(echauffement) === "3×6 @ 67.5 kg", label(echauffement));

// Assistance (Pull-Ups du screenshot) : dernière 4×8 @ assist. 14, cible -14
// (SIGNÉE depuis le Lot 26) → même difficulté, on garde 8.
const pullups = {
  defaults: { sets: 4, repsMin: 6, repsMax: 8 },
  targetWeight: -14,
  last: { sets: Array.from({ length: 4 }, () => ({ reps: 8, weight_kg: -14 })) },
};
const pu = sessionTarget(pullups);
t(`assistance portée par le signe de la cible`, pu.assist === true);
t(`assistance : poids d'objectif toujours positif en interne`, pu.weight === 14);
t(`assistance stable → « 4×8 @ assist. 14 kg »`, label(pullups) === "4×8 @ assist. 14 kg", label(pullups));

// MOINS d'assistance = plus dur → on repart en bas de fourchette. Une cible de
// -12 est PLUS GRANDE que -14 au sens signé : la comparaison est la même que
// pour une charge qui monte, sans branche « si assisté ».
const pullupsDur = { ...pullups, targetWeight: -12 };
t(`assistance réduite → plus dur → « 4×6 @ assist. 12 kg »`, label(pullupsDur) === "4×6 @ assist. 12 kg", label(pullupsDur));

// Lot 26 — le SIGNE voyage avec la cible, donc plus aucun cas « magnitude
// connue, convention inconnue ». Avant, set_exercise_target imposait > 0 et
// Claude écrivait « ASSISTANCE 14 kg » en prose : sur un exercice au poids du
// corps sans historique chargé, la case restait vide pour ne pas enregistrer
// +14 kg LESTÉS d'un tap. Maintenant -14 dit tout, et la case est pré-remplie.
const pdcAssiste = {
  defaults: { sets: 4, repsMin: 6, repsMax: 8 },
  targetWeight: -14,
  last: { sets: [{ reps: 8, weight_kg: null }] },
};
const pa = sessionTarget(pdcAssiste);
t("poids du corps + cible assistée → assistance, sans historique chargé", pa.assist === true && pa.weight === 14, JSON.stringify(pa));
t("poids du corps + cible assistée → « 4×8 @ assist. 14 kg »", formatTarget(pa) === "4×8 @ assist. 14 kg", formatTarget(pa));
t("poids du corps + cible assistée → case poids pré-remplie", targetRows(pa)[0].weight === "14");

// Le même exercice avec une cible POSITIVE veut maintenant dire « lesté » —
// c'est un sens, plus une ambiguïté. Le garde-fou qui empêche Claude de poser
// une cible positive sur un exercice assisté est côté service (Lot 26).
const pdcLeste = { ...pdcAssiste, targetWeight: 5 };
const pl = sessionTarget(pdcLeste);
t("poids du corps + cible positive → lesté assumé", pl.assist === false && pl.weight === 5);

const jamaisFait = sessionTarget({ defaults: { sets: 3, repsMin: 8, repsMax: 12 }, targetWeight: 20, last: null });
t("exercice jamais fait + cible → charge pré-remplie (signe connu)", jamaisFait.weight === 20 && targetRows(jamaisFait)[0].weight === "20");
// La cible fait autorité sur l'historique, y compris pour changer de convention.
const bascule = sessionTarget({
  defaults: { sets: 4, repsMin: 6, repsMax: 8 },
  targetWeight: 2.5,
  last: { sets: [{ reps: 8, weight_kg: -5 }] },
});
t("assisté la dernière fois, cible lestée → la cible fait foi", bascule.assist === false && bascule.weight === 2.5, JSON.stringify(bascule));
t("assisté → lesté : c'est plus dur, donc bas de fourchette", formatTarget(bascule) === "4×6 @ 2.5 kg", formatTarget(bascule));
const signeConnuCharge = sessionTarget({
  defaults: { sets: 4, repsMin: 6, repsMax: 8 },
  targetWeight: 70,
  last: { sets: [{ reps: 6, weight_kg: 67.5 }] },
});
t("historique chargé → cible pré-remplie côté charge", signeConnuCharge.weight === 70 && signeConnuCharge.assist === false);

// Transition assistance → lest : la difficulté est ordonnée par le poids SIGNÉ
// (-10 assisté < 0 < +5 lesté). Un `some(w < 0)` sur toute la séance lisait
// « assisté », désignait la série LESTÉE comme la moins assistée, et renvoyait
// les 4 reps à +5 kg en base à -5 kg.
const transition = sessionTarget({
  defaults: { sets: 3, repsMin: 4, repsMax: 8 },
  targetWeight: null,
  last: { sets: [
    { reps: 8, weight_kg: -10 },
    { reps: 5, weight_kg: -10 },
    { reps: 4, weight_kg: 5 },
  ] },
});
t("assistance → lest : la série lestée fait foi", transition.assist === false && transition.weight === 5, JSON.stringify(transition));
t("assistance → lest : libellé « 3×4 @ 5 kg »", formatTarget(transition) === "3×4 @ 5 kg", formatTarget(transition));

// Le plafond de fourchette s'applique AUSSI quand la charge monte : sans
// default_reps_min, la branche « ça monte » extrapolait à 12 reps.
const sansMin = sessionTarget({
  defaults: { sets: 4, repsMin: null, repsMax: 6 },
  targetWeight: 70,
  last: { sets: [{ reps: 12, weight_kg: 60 }] },
});
t("charge qui monte sans repsMin → capé au haut de fourchette", formatTarget(sansMin) === "4×6 @ 70 kg", formatTarget(sansMin));

// Un template à 0 série annonçait « 0×6 » pendant que targetRows rendait 1 ligne.
const zeroSeries = sessionTarget({
  defaults: { sets: 0, repsMin: 4, repsMax: 6 },
  targetWeight: 60,
  last: { sets: [{ reps: 6, weight_kg: 60 }] },
});
t("template à 0 série → au moins 1, libellé et lignes d'accord",
  zeroSeries.sets === 1 && targetRows(zeroSeries).length === 1, formatTarget(zeroSeries));

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
