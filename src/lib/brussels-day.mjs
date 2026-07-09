// Règle timezone du PRD : un log appartient au jour LOCAL Europe/Brussels.
// Module .mjs volontairement en JS pur : importé par l'app (Next) ET testé
// directement par scripts/verify-phase2.sh (test explicite du cas 23h30).
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Jour local Bruxelles (YYYY-MM-DD) pour un instant donné (défaut : maintenant). */
export function brusselsDay(instant = new Date()) {
  const d = instant instanceof Date ? instant : new Date(instant);
  return fmt.format(d);
}

/** Décale une date ISO (YYYY-MM-DD) de `delta` jours — calcul calendaire pur. */
export function shiftDay(isoDate, delta) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** true si la chaîne est une date ISO calendaire valide. */
export function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Lundi de la semaine contenant la date (la "semaine" du planificateur). */
export function mondayOf(isoDate) {
  const dow = new Date(`${isoDate}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return shiftDay(isoDate, dow === 0 ? -6 : 1 - dow);
}
