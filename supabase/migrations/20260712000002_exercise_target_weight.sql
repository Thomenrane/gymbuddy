-- Lot 14 : cible de poids par exercice, posée par Claude via MCP.
--
-- En séance, l'app pré-remplit le DERNIER poids fait mais n'indiquait pas le
-- poids À VISER. La cible est une propriété de l'EXERCICE (le prochain poids à
-- viser pour cet exo, quel que soit le jour), distincte du dernier poids fait
-- et du RPE cible du template.
--
-- Posée EXCLUSIVEMENT par Claude via set_exercise_target (jamais saisie à la
-- main — un poids fixe deviendrait obsolète à chaque progression). L'app la
-- stocke et l'affiche seulement : aucun calcul de cible dans l'app.
--
-- Colonnes NULLABLES → migration non cassante : les exercices existants
-- (dont les baselines) restent lisibles avec target_weight_kg = null.
alter table exercises
  add column target_weight_kg numeric,   -- prochain poids à viser ; null = pas de cible
  add column target_weight_note text;    -- courte justification optionnelle

comment on column exercises.target_weight_kg is
  'Prochain poids à viser pour cet exercice, posé par Claude via MCP (double '
  'progression). NULL = pas de cible. Distinct du dernier poids fait.';
