// Prouve les aides de saisie de l'écran séance (src/lib/session-controls.mjs) :
//  - les boutons ± n'inventent jamais une donnée fausse (case vide décrémentée,
//    pas de négatif, pas de 67.50000000000001)
//  - la virgule du clavier français est acceptée
//  - le compte à rebours se formate en m:ss et ne descend jamais sous zéro
import { stepValue, formatCountdown } from "../src/lib/session-controls.mjs";

let fail = 0;
const t = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fail = 1;
};

// Poids : pas de dérive flottante.
t('67.5 +2,5 → "70"', stepValue("67.5", 2.5) === "70", stepValue("67.5", 2.5));
t('67.5 −2,5 → "65"', stepValue("67.5", -2.5) === "65", stepValue("67.5", -2.5));
t('0.1 +0,2 → "0.3" (pas 0.30000000000000004)', stepValue("0.1", 0.2) === "0.3", stepValue("0.1", 0.2));
t('virgule française acceptée : "67,5" +2,5 → "70"', stepValue("67,5", 2.5) === "70", stepValue("67,5", 2.5));

// Reps.
t('6 +1 → "7"', stepValue("6", 1) === "7");
t('6 −1 → "5"', stepValue("6", -1) === "5");

// Cases vides : incrémenter part de zéro, décrémenter ne fabrique rien.
t('vide +2,5 → "2.5"', stepValue("", 2.5) === "2.5", stepValue("", 2.5));
t("vide −2,5 → reste vide (aucune donnée inventée)", stepValue("", -2.5) === "");
t("null −1 → reste vide", stepValue(null, -1) === "");
t('null +1 → "1"', stepValue(null, 1) === "1");

// Jamais de négatif : l'assistance passe par le bouton, pas par le signe.
t('1 −2,5 → "0", jamais négatif', stepValue("1", -2.5) === "0", stepValue("1", -2.5));
t('0 −1 → "0"', stepValue("0", -1) === "0");

// Saisie illisible : traitée comme vide, jamais NaN.
t('"abc" +1 → "1"', stepValue("abc", 1) === "1", stepValue("abc", 1));
t('"abc" −1 → ""', stepValue("abc", -1) === "");

// Compte à rebours.
t('150 s → "2:30"', formatCountdown(150) === "2:30", formatCountdown(150));
t('9 s → "0:09"', formatCountdown(9) === "0:09", formatCountdown(9));
t('60 s → "1:00"', formatCountdown(60) === "1:00", formatCountdown(60));
t('0 → "0:00"', formatCountdown(0) === "0:00");
t('négatif → "0:00" (jamais de compte à rebours à l\'envers)', formatCountdown(-5) === "0:00");
t('2.1 s → "0:03" (arrondi au-dessus, la barre ne saute pas)', formatCountdown(2.1) === "0:03", formatCountdown(2.1));

console.log(fail === 0 ? "  → saisie et chrono : tous passent" : "  → échecs");
process.exit(fail);
