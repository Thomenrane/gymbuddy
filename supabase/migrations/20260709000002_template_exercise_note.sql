-- Lot 7 — arbitrage PO (2026-07-09) : note par LIGNE de template.
-- La spec lot 7 prime sur l'AMENDEMENT 4 (Phase 0). Les deux notes coexistent :
--   * exercises.note          = convention GLOBALE (par haltère, assistance…)
--   * template_exercises.note = contexte de SÉANCE (superset, tempo…)
-- Exposée par create/update_workout_template et list_workout_templates.
alter table template_exercises add column if not exists note text;
