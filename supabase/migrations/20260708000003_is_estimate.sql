-- Lot 2.1 : presets d'estimation pour les logs libres.
-- default false + not null : les logs existants restent valides (false).
alter table meal_logs
  add column is_estimate boolean not null default false;

comment on column meal_logs.is_estimate is
  'true si les macros viennent d''un preset d''estimation (même après override manuel — décision PO FLAG 9)';
