-- Phase 6 : planificateur de semaine.
-- FLAG 8 (décision PO) : unique(plan_date, slot) — UN plat par slot
-- planifié, l'upsert sur date+slot REMPLACE. (Le PRD v2.1 proposait
-- unique(plan_date, slot, recipe_id), incompatible avec la sémantique
-- de remplacement de plan_meal.)
-- Un plan est un ensemble d'entrées datées ; la "semaine" est une vue
-- (lundi-dimanche). Pas de repas libre planifiable en v1.
create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  slot text not null check (slot in ('petit_dej','dejeuner','collation','diner','extra')),
  recipe_id uuid not null references recipes,
  portion_factor numeric not null default 1.0,
  notes text,
  created_at timestamptz not null default now(),
  unique (plan_date, slot)
);
create index meal_plan_entries_date_idx on meal_plan_entries (plan_date);

alter table meal_plan_entries enable row level security;
create policy owner_all on meal_plan_entries
  for all to authenticated using (is_owner()) with check (is_owner());
