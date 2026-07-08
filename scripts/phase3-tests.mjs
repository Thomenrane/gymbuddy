// Tests de données de la Phase 3 — utilise le VRAI module de pré-remplissage
// de l'app (src/lib/last-sets.mjs). Lancé par verify-phase3.sh avec
// NODE_USE_ENV_PROXY=1. Dates de test en 2126 : postérieures aux baselines
// (sinon elles ne deviendraient jamais la nouvelle référence), jamais en
// collision avec de vraies données, supprimées en fin de run.
import {
  latestSetsByExercise,
  formatWeight,
  pace,
  formatPace,
} from "../src/lib/last-sets.mjs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REST = `${URL_}/rest/v1`;
const D_MUSCU = "2126-01-01";
const D_CARDIO = "2126-01-02";
const BASELINE_NOTE = "baseline seed — poids de départ";

let failures = 0;
const chk = (label, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
};

async function api(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const fetchLastSetRows = (ids) =>
  api(
    `workout_sets?select=exercise_id,set_number,reps,weight_kg,workout:workouts!inner(id,workout_date,created_at)&exercise_id=in.(${ids.join(",")})`
  );

// ---------- 1. Template Day 1 + pré-remplissage = baselines ----------
console.log("-- Pré-remplissage depuis 'Day 1 — Lourd (force)' --");
const [tpl] = await api(
  `workout_templates?name=eq.${encodeURIComponent("Day 1 — Lourd (force)")}&select=id,template_exercises(position,exercise_id,default_sets,exercise:exercises(name))`
);
chk("template trouvé avec 5 exercices", Boolean(tpl) && tpl.template_exercises.length === 5);
const tex = tpl.template_exercises.sort((a, b) => a.position - b.position);
const ids = tex.map((t) => t.exercise_id);

const last = latestSetsByExercise(await fetchLastSetRows(ids));
const EXPECTED = {
  "Back Squat": { n: 3, reps: 4, w: 70 },
  "Barbell Bench Press": { n: 4, reps: 4, w: 60 },
  "Pull-Ups": { n: 4, reps: 6, w: -9 },
  "Dumbbell Lateral Raises": { n: 3, reps: 12, w: 8 },
  "Sit-Ups déclinés lestés": { n: 3, reps: 10, w: 10 },
};
for (const t of tex) {
  const exp = EXPECTED[t.exercise.name];
  const ref = last.get(t.exercise_id);
  chk(
    `${t.exercise.name} : dernier poids ET reps = baseline (${exp.n}×${exp.reps} @ ${formatWeight(exp.w)})`,
    Boolean(ref) &&
      ref.workout_date === "2026-07-08" &&
      ref.sets.length === exp.n &&
      ref.sets.every((s) => s.reps === exp.reps && s.weight_kg === exp.w),
    JSON.stringify(ref?.sets)
  );
}
chk('assistance : formatWeight(-9) = "assist. 9 kg"', formatWeight(-9) === "assist. 9 kg");
chk('poids du corps : formatWeight(null) = "PDC"', formatWeight(null) === "PDC");

// ---------- 2. Séance depuis le template : +1 set, poids modifié, +1 exo ----------
console.log("-- Création de séance (modifications sur le pré-rempli) --");
const [calf] = await api(`exercises?name=eq.${encodeURIComponent("Press mollets")}&select=id,name`);
chk("exo du catalogue trouvé (Press mollets)", Boolean(calf));

const [workout] = await api("workouts", {
  method: "POST",
  prefer: "return=representation",
  body: {
    workout_date: D_MUSCU,
    type: "muscu",
    template_id: tpl.id,
    duration_min: 55,
    perceived_intensity: 8,
    notes: "__VERIFY_P3__",
  },
});
const setRows = [];
tex.forEach((t, i) => {
  const ref = last.get(t.exercise_id);
  let sets = ref.sets.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg }));
  if (t.exercise.name === "Back Squat") {
    sets = sets.map((s) => ({ ...s, weight_kg: 72.5 })); // poids modifié
    sets.push({ reps: 4, weight_kg: 72.5 }); // set ajouté
  }
  sets.forEach((s, j) =>
    setRows.push({
      workout_id: workout.id,
      exercise_id: t.exercise_id,
      position: i + 1,
      set_number: j + 1,
      ...s,
    })
  );
});
// exercice ajouté depuis le catalogue
[1, 2, 3].forEach((j) =>
  setRows.push({
    workout_id: workout.id,
    exercise_id: calf.id,
    position: 6,
    set_number: j,
    reps: 12,
    weight_kg: 90,
  })
);
await api("workout_sets", { method: "POST", body: setRows });
chk(
  "séance sauvegardée : 5 exos du template (+1 set, poids 70→72.5) + Press mollets",
  setRows.length === 3 + 1 + 4 + 4 + 3 + 3 + 3
);

// ---------- 3. La nouvelle séance devient la référence ----------
console.log("-- Nouvelle référence 'dernière fois' --");
const last2 = latestSetsByExercise(await fetchLastSetRows([...ids, calf.id]));
const bsId = tex.find((t) => t.exercise.name === "Back Squat").exercise_id;
const puId = tex.find((t) => t.exercise.name === "Pull-Ups").exercise_id;
const bsRef = last2.get(bsId);
chk(
  "Back Squat : référence = nouvelle séance (4 sets @ 72.5)",
  bsRef.workout_date === D_MUSCU &&
    bsRef.sets.length === 4 &&
    bsRef.sets.every((s) => s.weight_kg === 72.5)
);
chk(
  "Pull-Ups : assistance -9 conservée dans la nouvelle référence",
  last2.get(puId).workout_date === D_MUSCU &&
    last2.get(puId).sets.every((s) => s.weight_kg === -9)
);
chk(
  "Press mollets : le nouvel exo a désormais une référence (3×12 @ 90 kg)",
  last2.get(calf.id)?.sets.length === 3 &&
    last2.get(calf.id).sets.every((s) => s.weight_kg === 90)
);

// ---------- 4. Running : pace calculé ----------
console.log("-- Running --");
const [run] = await api("workouts", {
  method: "POST",
  prefer: "return=representation",
  body: {
    workout_date: D_CARDIO,
    type: "running",
    distance_km: 8,
    run_type: "normal",
    duration_min: 44,
    notes: "__VERIFY_P3__",
  },
});
chk(
  "running stocké (8 km, normal, 44 min)",
  Number(run.distance_km) === 8 && run.run_type === "normal" && run.duration_min === 44
);
chk('pace : 44 min / 8 km = 5.5 → "5:30 /km"', pace(8, 44) === 5.5 && formatPace(8, 44) === "5:30 /km");

// ---------- 5. Padel + édition + suppression ----------
console.log("-- Padel, édition, suppression --");
const [padel] = await api("workouts", {
  method: "POST",
  prefer: "return=representation",
  body: {
    workout_date: D_CARDIO,
    type: "padel",
    duration_min: 90,
    perceived_intensity: 7,
    notes: "__VERIFY_P3__",
  },
});
chk("padel stocké (90 min, intensité 7)", padel.duration_min === 90 && padel.perceived_intensity === 7);

await api(`workouts?id=eq.${run.id}`, { method: "PATCH", body: { duration_min: 40 } });
const [edited] = await api(`workouts?id=eq.${run.id}&select=duration_min`);
chk('édition : running 44 → 40 min (pace recalculé "5:00 /km")', edited.duration_min === 40 && formatPace(8, 40) === "5:00 /km");

await api(`workouts?id=eq.${padel.id}`, { method: "DELETE" });
const goneCheck = await api(`workouts?id=eq.${padel.id}&select=id`);
chk("suppression : padel disparu", goneCheck.length === 0);

// ---------- 6. Nettoyage sans toucher aux baselines ----------
console.log("-- Nettoyage --");
await api(`workouts?workout_date=in.(${D_MUSCU},${D_CARDIO})`, { method: "DELETE" });
const leftovers = await api(`workouts?workout_date=in.(${D_MUSCU},${D_CARDIO})&select=id`);
chk("zéro workout de test restant", leftovers.length === 0);
const baselines = await api(
  `workouts?notes=eq.${encodeURIComponent(BASELINE_NOTE)}&select=id,workout_sets(id)`
);
chk(
  "les 3 baselines et leurs 51 sets sont intacts",
  baselines.length === 3 &&
    baselines.reduce((s, w) => s + w.workout_sets.length, 0) === 51
);

process.exit(failures === 0 ? 0 : 1);
