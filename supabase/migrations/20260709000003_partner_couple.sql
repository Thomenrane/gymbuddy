-- Lot 11 : mode couple (profil partenaire, sans second compte).
--
-- Sarah est un PROFIL DE MACROS, pas un utilisateur : aucune 2e auth, aucune
-- refonte RLS. Toutes les tables restent single-user (is_owner()). Le mode
-- couple est opt-in par repas ; le solo reste le défaut absolu (colonnes
-- for_two à false par défaut → aucun impact sur les logs/plans existants).
--
-- Modèle validé (FLAGs PO) :
--  - meal_logs.for_two + po_share : on stocke UNIQUEMENT la part PO
--    (recette × portion_factor × po_share). La part Sarah se dérive à
--    l'affichage (base = part_PO / po_share ; Sarah = base × (1 − po_share)),
--    jamais stockée → les tendances ne comptent jamais Sarah par construction.
--    Garde-fou : sur un log for_two, 0 < po_share < 1 (sinon division par zéro
--    dans la dérivation) — imposé côté service + verify, et en CHECK ici.
--  - meal_plan_entries.for_two + po_share + total_portion : en mode couple,
--    total_portion fait autorité (portion_factor reste 1.0, inutilisé).
--    Total PO du jour = recette × total_portion × po_share ; Sarah = recette ×
--    total_portion × (1 − po_share) ; courses = recette × total_portion.

-- Profil partenaire : singleton (id = 1). Éditable dans Réglages.
create table partner_profile (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Sarah',
  kcal integer not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table partner_profile enable row level security;
create policy owner_all on partner_profile
  for all to authenticated using (is_owner()) with check (is_owner());

-- Seed Sarah (cible validée PO). is_active=false : le mode couple s'active
-- explicitement dans Réglages, rien ne change tant qu'il n'est pas activé.
insert into partner_profile (id, name, kcal, protein_g, carbs_g, fat_g, is_active)
values (1, 'Sarah', 2050, 125, 235, 65, false)
on conflict (id) do nothing;

-- Repas loggés : opt-in couple par repas.
alter table meal_logs
  add column for_two boolean not null default false,
  add column po_share numeric not null default 1.0;
-- Sur un repas pour deux, la part PO doit être strictement entre 0 et 1
-- (sinon la dérivation de la part Sarah divise par zéro / est incohérente).
-- En solo (for_two=false), po_share reste 1.0.
alter table meal_logs
  add constraint meal_logs_po_share_couple_ck
  check (
    (for_two = false and po_share = 1.0)
    or (for_two = true and po_share > 0 and po_share < 1)
  );

-- Plan de semaine : opt-in couple par entrée planifiée.
alter table meal_plan_entries
  add column for_two boolean not null default false,
  add column po_share numeric not null default 1.0,
  add column total_portion numeric not null default 1.0;
alter table meal_plan_entries
  add constraint meal_plan_entries_po_share_couple_ck
  check (
    (for_two = false and po_share = 1.0)
    or (for_two = true and po_share > 0 and po_share < 1)
  );
