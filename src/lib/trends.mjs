// Calculs de l'onglet Tendances (PRD §4) — module JS pur : utilisé par
// la page ET testé directement par scripts/verify-phase5.sh contre des
// calculs de référence indépendants.
import { mondayOf } from "./brussels-day.mjs";

const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Moyenne hebdomadaire de poids (le protocole juge sur la MOYENNE,
 * pas les points quotidiens). Semaines lundi→dimanche.
 * @param {{metric_date: string, weight_kg: number|string|null}[]} metrics
 * @returns {{week_start: string, avg_weight_kg: number, measurements: number}[]} trié
 */
export function weeklyWeightAverages(metrics) {
  const weeks = new Map();
  for (const m of metrics) {
    if (m.weight_kg == null) continue;
    const wk = mondayOf(m.metric_date);
    weeks.set(wk, [...(weeks.get(wk) ?? []), Number(m.weight_kg)]);
  }
  return [...weeks.entries()]
    .sort()
    .map(([week_start, vals]) => ({
      week_start,
      avg_weight_kg: r2(vals.reduce((s, v) => s + v, 0) / vals.length),
      measurements: vals.length,
    }));
}

/**
 * Progression de charge d'UN exercice : par séance (date), poids max et
 * volume (Σ reps × poids ; poids du corps null compte 0, assistance
 * négative compte négativement — le max remonte vers 0 quand l'assistance
 * diminue, ce qui EST la progression).
 * @param {{workout_date: string, reps: number|null, weight_kg: number|string|null}[]} sets
 * @returns {{date: string, max_weight_kg: number|null, volume: number}[]} trié par date
 */
export function exerciseProgression(sets) {
  const byDate = new Map();
  for (const s of sets) {
    const d = byDate.get(s.workout_date) ?? { weights: [], volume: 0 };
    if (s.weight_kg != null) d.weights.push(Number(s.weight_kg));
    d.volume += (s.reps ?? 0) * Number(s.weight_kg ?? 0);
    byDate.set(s.workout_date, d);
  }
  return [...byDate.entries()]
    .sort()
    .map(([date, d]) => ({
      date,
      max_weight_kg: d.weights.length ? Math.max(...d.weights) : null,
      volume: r1(d.volume),
    }));
}

/**
 * Moyennes kcal/protéines par JOUR LOGGÉ sur une période (les jours sans
 * log ne comptent pas — cohérent avec get_summary).
 * @param {{log_date: string, kcal: number, protein_g: number|string}[]} logs
 * @returns {{days_logged: number, kcal_avg: number|null, protein_avg: number|null}}
 */
export function periodAverages(logs) {
  const byDay = new Map();
  for (const l of logs) {
    const d = byDay.get(l.log_date) ?? { kcal: 0, p: 0 };
    d.kcal += l.kcal;
    d.p += Number(l.protein_g);
    byDay.set(l.log_date, d);
  }
  const n = byDay.size;
  if (n === 0) return { days_logged: 0, kcal_avg: null, protein_avg: null };
  const days = [...byDay.values()];
  return {
    days_logged: n,
    kcal_avg: r1(days.reduce((s, d) => s + d.kcal, 0) / n),
    protein_avg: r1(days.reduce((s, d) => s + d.p, 0) / n),
  };
}

/**
 * Séances par semaine (lundi→dimanche) par type — objectif 3 muscu.
 * @param {{workout_date: string, type: string}[]} workouts
 * @returns {{week_start: string, counts: Record<string, number>, total: number}[]} trié
 */
export function sessionsPerWeek(workouts) {
  const weeks = new Map();
  for (const w of workouts) {
    const wk = mondayOf(w.workout_date);
    const counts = weeks.get(wk) ?? {};
    counts[w.type] = (counts[w.type] ?? 0) + 1;
    weeks.set(wk, counts);
  }
  return [...weeks.entries()]
    .sort()
    .map(([week_start, counts]) => ({
      week_start,
      counts,
      total: Object.values(counts).reduce((s, v) => s + v, 0),
    }));
}
