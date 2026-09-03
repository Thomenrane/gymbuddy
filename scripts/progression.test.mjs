// Prouve le module de progression (src/lib/progression.mjs) :
//  - « objectif atteint » = TOUTES les séries au haut de fourchette, au poids
//    visé, RPE ≤ cible là où il est saisi
//  - il faut DEUX séances d'affilée (demande PO), pas une
//  - le poids est SIGNÉ : progresser, c'est toujours augmenter le signé, donc
//    -14 → -12 sur un exercice assisté (moins d'aide)
//  - une proposition refusée ne revient pas
//  - l'app ne fabrique jamais de cible là où il n'y en a pas
import {
  reachedObjective,
  suggestNextTarget,
  formatSuggestion,
  DEFAULT_STEP_KG,
} from "../src/lib/progression.mjs";

let fail = 0;
const t = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fail = 1;
};

const sets = (...rows) =>
  rows.map(([reps, w, rpe = null]) => ({ reps, weight_kg: w, rpe }));

// ---------- reachedObjective ----------
const D = { repsMax: 6, signedTarget: 67.5, targetRpe: 8 };
t(
  "4×6 @ 67.5 RPE 7 → objectif atteint",
  reachedObjective(sets([6, 67.5, 7], [6, 67.5, 7], [6, 67.5, 8], [6, 67.5, 8]), D)
);
t(
  "une série à 5 reps → NON atteint (double progression)",
  !reachedObjective(sets([6, 67.5], [6, 67.5], [5, 67.5]), D)
);
t(
  "poids sous la cible → NON atteint",
  !reachedObjective(sets([6, 65], [6, 65], [6, 65]), D)
);
t(
  "au-dessus de la cible → atteint (il a mis plus lourd)",
  reachedObjective(sets([6, 70], [6, 70]), D)
);
t(
  "RPE 9 sur une série → NON atteint (trop dur pour monter)",
  !reachedObjective(sets([6, 67.5, 7], [6, 67.5, 9]), D)
);
t(
  "RPE non saisi → n'empêche pas (il reste optionnel)",
  reachedObjective(sets([6, 67.5], [6, 67.5]), D)
);
t("aucune série exploitable → NON atteint", !reachedObjective([], D));
t(
  "sans haut de fourchette, on s'abstient plutôt que d'inventer un seuil",
  !reachedObjective(sets([12, 67.5]), { ...D, repsMax: null })
);
// Assistance : le haut de fourchette et le poids SIGNÉ.
t(
  "assisté : 4×8 @ -14 avec cible -14 → atteint",
  reachedObjective(sets([8, -14], [8, -14], [8, -14], [8, -14]), {
    repsMax: 8,
    signedTarget: -14,
    targetRpe: null,
  })
);
t(
  "assisté : plus d'aide que la cible (-16 < -14) → NON atteint",
  !reachedObjective(sets([8, -16], [8, -16]), {
    repsMax: 8,
    signedTarget: -14,
    targetRpe: null,
  })
);

// ---------- suggestNextTarget ----------
const ok6 = { sets: sets([6, 67.5, 7], [6, 67.5, 7], [6, 67.5, 8], [6, 67.5, 8]) };
const ko6 = { sets: sets([6, 67.5], [5, 67.5]) };
const base = { defaults: { repsMax: 6, targetRpe: 8 }, signedTarget: 67.5 };

t("une seule séance réussie → pas encore de proposition", suggestNextTarget({ ...base, sessions: [ok6] }) === null);
const s2 = suggestNextTarget({ ...base, sessions: [ok6, ok6] });
t("deux séances réussies → proposition", s2 != null && s2.to === 70, JSON.stringify(s2));
t("pas par défaut = 2,5 kg", s2?.step === DEFAULT_STEP_KG);
t("libellé « 67,5 → 70 kg »", formatSuggestion(s2) === "67,5 → 70 kg", String(formatSuggestion(s2)));
t(
  "la séance la plus récente ratée → pas de proposition",
  suggestNextTarget({ ...base, sessions: [ko6, ok6] }) === null
);
t(
  "l'avant-dernière ratée → pas de proposition (il faut 2 d'affilée)",
  suggestNextTarget({ ...base, sessions: [ok6, ko6] }) === null
);
t(
  "une troisième séance plus ancienne n'est pas regardée",
  suggestNextTarget({ ...base, sessions: [ok6, ok6, ko6] })?.to === 70
);
t(
  "pas d'exercice : pas de cible → aucune proposition inventée",
  suggestNextTarget({ ...base, signedTarget: null, sessions: [ok6, ok6] }) === null
);
t(
  "pas personnalisé (haltères +2)",
  suggestNextTarget({ ...base, sessions: [ok6, ok6], step: 2 })?.to === 69.5
);
t(
  "proposition déjà refusée → on ne la repropose pas",
  suggestNextTarget({ ...base, sessions: [ok6, ok6], declined: 70 }) === null
);
t(
  "refus d'une AUTRE valeur → la proposition tient",
  suggestNextTarget({ ...base, sessions: [ok6, ok6], declined: 72.5 })?.to === 70
);

// Assistance : progresser = réduire l'aide, donc AUGMENTER le signé.
const okA = { sets: sets([8, -14], [8, -14], [8, -14]) };
const sa = suggestNextTarget({
  defaults: { repsMax: 8, targetRpe: null },
  signedTarget: -14,
  step: 2,
  sessions: [okA, okA],
});
t("assisté : -14 → -12 (moins d'aide)", sa?.to === -12, JSON.stringify(sa));
t("libellé assisté « assist. 14 → 12 kg »", formatSuggestion(sa) === "assist. 14 → 12 kg", String(formatSuggestion(sa)));

// Franchir zéro changerait de convention sans que personne ne l'ait décidé.
const okA1 = { sets: sets([8, -1], [8, -1]) };
t(
  "assistance qui franchirait zéro → on s'arrête, le PO tranche",
  suggestNextTarget({
    defaults: { repsMax: 8, targetRpe: null },
    signedTarget: -1,
    step: 2.5,
    sessions: [okA1, okA1],
  }) === null
);

// Arrondi : pas de 69.99999999999999 dans une case de saisie.
const sr = suggestNextTarget({
  defaults: { repsMax: 6, targetRpe: null },
  signedTarget: 0.1,
  step: 0.2,
  sessions: [{ sets: sets([6, 0.1]) }, { sets: sets([6, 0.1]) }],
});
t("arrondi à 2 décimales", sr?.to === 0.3, JSON.stringify(sr));

t("formatSuggestion(null) → null", formatSuggestion(null) === null);

console.log(fail === 0 ? "  → progression : tous passent" : "  → des tests échouent");
process.exit(fail);
