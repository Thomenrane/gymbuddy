-- Scan code-barres (Open Food Facts) : un produit scanné entre dans la
-- référence nutritionnelle pour que Claude (MCP) compose/vérifie les recettes
-- avec les valeurs étiquette exactes. Nouvelle source 'off' + EAN de
-- traçabilité (re-scan → upsert de la même ligne (item, basis)).
alter table nutrition_ref drop constraint if exists nutrition_ref_source_check;
alter table nutrition_ref add constraint nutrition_ref_source_check
  check (source in ('seed', 'claude', 'florian', 'off'));

alter table nutrition_ref add column if not exists ean text;
comment on column nutrition_ref.ean is
  'Code-barres du produit scanné (renseigné quand source = off).';
