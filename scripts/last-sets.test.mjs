// Prouve l'ÉQUIVALENCE des deux chemins de « dernière fois » (Lot 25) :
// l'ancien (tout l'historique trié en JS) et le nouveau (RPC
// latest_sets_by_exercise, tri fait en SQL) doivent produire exactement le même
// résultat. C'est ce qui rend le repli sûr quand la migration n'est pas encore
// appliquée : l'ordre déploiement / migration devient sans importance.
import {
  latestSetsByExercise,
  setsFromLatestRows,
} from "../src/lib/last-sets.mjs";

let fail = 0;
const t = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fail = 1;
};

const EX_A = "aaaaaaaa-0000-0000-0000-000000000001";
const EX_B = "bbbbbbbb-0000-0000-0000-000000000002";
const w = (id, date, created) => ({ id, workout_date: date, created_at: created });
const VIEUX = w("w1", "2026-08-01", "2026-08-01T10:00:00Z");
const RECENT = w("w2", "2026-08-28", "2026-08-28T10:00:00Z");
// Même jour que RECENT : c'est created_at qui départage.
const MEME_JOUR = w("w3", "2026-08-28", "2026-08-28T18:00:00Z");

// Chemin historique : toutes les séries, tous workouts confondus.
const brut = [
  { exercise_id: EX_A, set_number: 1, reps: 8, weight_kg: 60, workout: VIEUX },
  { exercise_id: EX_A, set_number: 2, reps: 8, weight_kg: 60, workout: VIEUX },
  { exercise_id: EX_A, set_number: 2, reps: 6, weight_kg: "67.5", workout: RECENT },
  { exercise_id: EX_A, set_number: 1, reps: 6, weight_kg: "67.5", workout: RECENT },
  { exercise_id: EX_B, set_number: 1, reps: 8, weight_kg: -14, workout: MEME_JOUR },
  { exercise_id: EX_B, set_number: 1, reps: 10, weight_kg: -16, workout: RECENT },
];
const ancien = latestSetsByExercise(brut);

// Chemin RPC : la base a déjà fait le tri, ne restent que les séries utiles.
const rpc = [
  { exercise_id: EX_A, workout_date: "2026-08-28", set_number: 1, reps: 6, weight_kg: "67.5" },
  { exercise_id: EX_A, workout_date: "2026-08-28", set_number: 2, reps: 6, weight_kg: "67.5" },
  { exercise_id: EX_B, workout_date: "2026-08-28", set_number: 1, reps: 8, weight_kg: -14 },
];
const nouveau = setsFromLatestRows(rpc);

t("mêmes exercices renvoyés",
  [...ancien.keys()].sort().join(",") === [...nouveau.keys()].sort().join(","));
t("exercice A : résultats identiques",
  JSON.stringify(ancien.get(EX_A)) === JSON.stringify(nouveau.get(EX_A)),
  `${JSON.stringify(ancien.get(EX_A))} vs ${JSON.stringify(nouveau.get(EX_A))}`);
t("exercice B (départagé par created_at) : résultats identiques",
  JSON.stringify(ancien.get(EX_B)) === JSON.stringify(nouveau.get(EX_B)),
  `${JSON.stringify(ancien.get(EX_B))} vs ${JSON.stringify(nouveau.get(EX_B))}`);

// Conventions conservées par le nouveau chemin.
t("séries triées par numéro même si la base les renvoyait dans le désordre",
  setsFromLatestRows([
    { exercise_id: EX_A, workout_date: "2026-08-28", set_number: 3, reps: 5, weight_kg: 60 },
    { exercise_id: EX_A, workout_date: "2026-08-28", set_number: 1, reps: 6, weight_kg: 60 },
  ]).get(EX_A).sets.map((s) => s.set_number).join(",") === "1,3");
t("poids numériques (numeric Postgres arrive en chaîne)",
  nouveau.get(EX_A).sets.every((s) => typeof s.weight_kg === "number"));
t("poids du corps conservé en null",
  setsFromLatestRows([{ exercise_id: EX_A, workout_date: "2026-08-28", set_number: 1, reps: 12, weight_kg: null }])
    .get(EX_A).sets[0].weight_kg === null);
t("assistance conservée négative",
  nouveau.get(EX_B).sets[0].weight_kg === -14);
t("aucune ligne → map vide, jamais d'erreur",
  setsFromLatestRows([]).size === 0 && setsFromLatestRows(null).size === 0);

console.log(fail === 0 ? "  → dernière fois : les deux chemins concordent" : "  → échecs");
process.exit(fail);
