-- Lot 13 : préférences alimentaires par personne (Florian, Sarah).
--
-- Les goûts/aversions vivaient seulement dans la mémoire conversationnelle de
-- Claude → une nouvelle session ne les voyait pas de façon fiable. On en fait
-- une source de vérité en base, exposée via MCP, pour que Claude ne propose
-- jamais un aliment rejeté quelle que soit la session.
--
-- Labels LIBRES (pas de parsing d'ingrédients, pas de détection d'allergènes —
-- non-goals). Aucun filtrage automatique de recettes dans l'app : c'est Claude
-- qui en tient compte à la planification.
create table food_preferences (
  id uuid primary key default gen_random_uuid(),
  person text not null,          -- 'florian' | 'sarah' (aligné sur partner_profile)
  kind text not null check (kind in ('dislike','allergy','preference')),
  label text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index food_preferences_person_idx on food_preferences (person);

alter table food_preferences enable row level security;
create policy owner_all on food_preferences
  for all to authenticated using (is_owner()) with check (is_owner());

-- Seed initial (préférences connues du PO).
insert into food_preferences (person, kind, label) values
  ('florian', 'dislike', 'poisson blanc'),
  ('florian', 'dislike', 'thon'),
  ('sarah', 'dislike', 'beans (haricots / légumineuses)');
