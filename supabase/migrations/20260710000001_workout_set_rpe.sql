-- Lot 12 : RPE (effort perçu) optionnel par série.
--
-- Le programme du PO est calibré à RPE cible 8 (porté par
-- template_exercises.target_rpe). Ce qui manquait : le RPE RÉELLEMENT
-- ressenti par série, pour comparer au cible et piloter la surcharge.
--
-- Colonne NULLABLE (jamais obligatoire) — migration non cassante : les sets
-- existants (dont les 51 baselines seedées) restent lisibles avec rpe = null.
-- Échelle 1-10, demi-points autorisés (ex. 8.5) → numeric + CHECK de borne.
-- Distinct de workouts.perceived_intensity (ressenti GLOBAL de fin de séance),
-- qui n'est pas touché.
alter table workout_sets
  add column rpe numeric
  check (rpe is null or (rpe >= 1 and rpe <= 10));

comment on column workout_sets.rpe is
  'RPE ressenti (1-10, demi-points ok) pour CETTE série. NULL = non renseigné. '
  'À comparer au template_exercises.target_rpe pour calibrer la progression.';
