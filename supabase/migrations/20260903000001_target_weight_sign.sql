-- Lot 26 : la CIBLE de poids devient SIGNÉE, comme les séries.
--
-- Le Lot 14 imposait target_weight_kg > 0. L'assistance était donc
-- inexprimable : Claude l'écrivait en prose dans target_weight_note
-- (« ASSISTANCE 14 kg (soit -14) »), l'app recevait +14, et depuis le Lot 19
-- elle pré-remplit les cases avec l'objectif — soit 14 kg LESTÉS proposés pour
-- une séance assistée, sous un en-tête « poids (kg) », validables d'un tap.
-- Le signe et la magnitude voyagent maintenant ensemble, avec la convention
-- déjà en vigueur pour workout_sets.weight_kg (AMENDEMENT 3) :
--   positif = charge ajoutée · négatif = assistance · null = pas de cible.
--
-- Aucune contrainte SQL n'a jamais porté le « > 0 » (il vivait dans
-- src/lib/mcp/service.ts) : cette migration ne défait donc aucun check, elle
-- documente la convention et reprend les données déjà posées.

comment on column exercises.target_weight_kg is
  'Prochain poids à viser pour cet exercice, posé par Claude via MCP (double '
  'progression). SIGNÉ comme workout_sets.weight_kg (AMENDEMENT 3) : positif = '
  'charge ajoutée, négatif = assistance. NULL = pas de cible. Distinct du '
  'dernier poids fait.';

-- Reprise des cibles posées sous l'ancienne convention. Un exercice dont
-- TOUTES les séries chargées connues sont assistées ne peut pas porter une
-- cible « lestée » : la valeur positive y est une magnitude d'assistance.
-- La condition « aucune série positive » évite de retourner un exercice en
-- transition assistance → lest, où le positif est bien un lest.
-- Idempotente : après bascule, target_weight_kg > 0 est faux.
update exercises e
set target_weight_kg = -e.target_weight_kg
where e.target_weight_kg > 0
  and exists (
    select 1 from workout_sets s where s.exercise_id = e.id and s.weight_kg < 0
  )
  and not exists (
    select 1 from workout_sets s where s.exercise_id = e.id and s.weight_kg > 0
  );
