-- Lot 27 : une séance EN COURS existe enfin quelque part.
--
-- Demande PO : « quand je quitte une session en cours elle apparaît toujours
-- nulle part — je devrais pouvoir la voir en "En cours" sur la page Training,
-- au même emplacement qu'une session terminée, et cliquer dessus pour
-- continuer ».
--
-- Avant : la séance en cours ne vivait que dans le localStorage du navigateur,
-- et seulement si l'utilisateur MODIFIAIT une case (drapeau `dirty` du Lot 22).
-- Or depuis le Lot 19 les cases arrivent pré-remplies à l'objectif : une séance
-- faite exactement comme prévu ne touche rien, donc aucun brouillon n'était
-- écrit, donc il n'y avait rien à reprendre. Les Lots 19 et 22 se neutralisaient.
--
-- POURQUOI UNE TABLE À PART, ET PAS UN STATUT SUR `workouts` :
-- `workouts` est lu depuis 15 endroits (Tendances, MCP, « dernière fois »,
-- calendrier, résumés). Un statut obligerait chacun d'eux à exclure les séances
-- en cours, et le premier oubli transforme une séance à moitié saisie en
-- « dernière fois » de l'exercice ou en point de Tendances — silencieusement.
-- Une table séparée rend ce risque NUL par construction : aucune lecture
-- existante ne peut voir un brouillon. La séance n'entre dans `workouts` qu'à
-- « Terminer », par le chemin d'enregistrement qui existe déjà.
--
-- Non cassante : table nouvelle, aucune ligne existante touchée.
create table workout_drafts (
  id uuid primary key default gen_random_uuid(),
  workout_date date not null,
  type text not null default 'muscu' check (type in ('muscu','running','padel','autre')),
  -- Le template peut être archivé pendant la séance : on garde le brouillon.
  template_id uuid references workout_templates on delete set null,
  -- Titre figé à l'ouverture : la ligne « En cours » reste lisible même si le
  -- template est renommé ou archivé entre-temps.
  title text not null,
  -- État exact de l'éditeur (exercices, séries saisies, notes). Du JSON parce
  -- qu'un brouillon contient des saisies INCOMPLÈTES — « 6 » puis « 67, » en
  -- cours de frappe — que le schéma normalisé de workout_sets refuserait.
  payload jsonb not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- La page Training liste les brouillons du plus récemment touché au plus
-- ancien, tous jours confondus (une séance commencée hier soir se reprend ce
-- matin sans naviguer dans le calendrier).
create index workout_drafts_updated_idx on workout_drafts (updated_at desc);

alter table workout_drafts enable row level security;
create policy owner_all on workout_drafts
  for all to authenticated using (is_owner()) with check (is_owner());

comment on table workout_drafts is
  'Séance commencée et pas encore terminée. Volontairement HORS de workouts : '
  'aucune statistique, aucune « dernière fois », aucun résumé MCP ne doit voir '
  'une séance à moitié saisie. Supprimée à « Terminer » (la séance est alors '
  'écrite dans workouts) comme à « Abandonner ».';
