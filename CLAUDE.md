# Gym Buddy — guide agent

PWA perso de suivi nutrition + training (recomposition corporelle). Next.js 16
(App Router, `src/`) + Tailwind 4, Supabase (Postgres + RLS single-user, auth
magic link), déploiement Vercel. Serveur MCP sur `/api/mcp` (bearer `MCP_SECRET`)
pour piloter l'app depuis une conversation Claude. Spec : `PRD-app-recomp-v2.md`
(+ addenda). UI en **français**, mobile-first strict.

## Règle — vérifier les macros AVANT d'encoder une recette

À chaque fois qu'on **ajoute** une recette (`add_recipe`) ou qu'on **modifie ses
macros** (`update_recipe`), il faut **recomposer les calories/macros à partir des
ingrédients contre une base nutritionnelle** (CIQUAL/ANSES en référence, USDA en
secours) **avant de valider** — ne jamais se fier aux macros « de mémoire ».

Outil dédié (garde-fou déterministe) :

```bash
# une recette (fichier ou stdin) : { name?, kcal, protein_g, carbs_g, fat_g, ingredients:[{item,qty,unit}] }
node scripts/verify-recipe-macros.mjs recette.json
node scripts/verify-recipe-macros.mjs --all      # ré-audite tout le livre (DB)
```

Protocole :
1. Passer la recette dans le script. Verdict **gradué** : **ok** (écart kcal
   ≤ 10 %), **warn** (ingrédients connus, écart 10–25 % → ajuster aux valeurs
   recomposées avant d'encoder), **warn_high** (écart > 25 % → probable erreur),
   **review** (ingrédient non référencé). Aucun verdict ne bloque : c'est un
   contrôle éditorial (WARN, pas REJECT).
2. Pour un **ingrédient nouveau** : web-vérifier sa valeur /100 g (CIQUAL) et
   l'**ajouter à `scripts/lib/nutrition-ref.mjs`** dans la bonne table, puis
   relancer. Ne jamais laisser un ingrédient compté à zéro en silence.
3. Conventions de la table : viandes/poissons = **cru** ; féculents (riz, pâtes,
   quinoa, semoule, avoine) = poids **sec** ; poids par pièce et densités ml
   gérés. Ancres web : poulet cru 121/23, riz complet cru 356/7/77/2.2, bœuf 5 %
   130/22, avoine 372/13.5/58/7 (kcal/P/G/L par 100 g).
4. Signaler l'écart au PO ; n'encoder qu'après correction (verdict ok).

Test du garde-fou : `node scripts/nutrition-check.test.mjs` (prouve qu'une recette
sous-estimée est signalée, une correcte acceptée, un ingrédient nouveau flaggé).

### Référence en base + garde-fou MCP (côté connecteur claude.ai)

La table CIQUAL est **matérialisée en base** (`nutrition_ref`, seedée depuis
`scripts/lib/nutrition-ref.mjs`) pour que **Claude.ai** puisse vérifier ses
propres estimations via le MCP, sans lire ce guide :
- `check_recipe_macros` : recompose + verdict gradué + **détail par ingrédient**,
  à appeler **avant** `add_recipe`. Le backstop de `add_recipe`/`update_recipe`
  renvoie aussi un `macro_check` (filet, jamais bloquant).
- `add_ingredient_ref` : Claude.ai ajoute un ingrédient absent, flaggé
  **`verified=false`** (« à vérifier »). L'agent web-vérifie la vraie valeur
  CIQUAL et bascule `verified=true` (boucle de curation).
- `list_ingredient_refs({verified:false})` : les ingrédients à curer.

La recompose fusionne la **DB par-dessus le seed** statique (`tablesFromRows`) :
la DB fait autorité, le seed reste le repli si la table n'est pas encore migrée.
Une **routine quotidienne** (`trig_…`, cron `0 7 * * *`) audite les recettes
`source=claude` récentes + les `nutrition_ref` non vérifiés.

> Le module pur (`checkRecipe`/`computeMacros`, tables en paramètre) reste la
> source unique ; `src/lib/nutrition-ref.mjs` le ré-exporte pour le MCP. Contrat :
> `scripts/verify-nutrition-ref.sh`.

## Discipline de travail

- **Challenge-first** : FLAG les divergences/ambiguïtés AVANT de coder.
- **Commits atomiques** : `tsc --noEmit` + `next build` verts à chaque commit.
- **Contrats de vérification** : chaque phase/lot a un `scripts/verify-*.sh` qui
  sort avec exit 0 ; ne jamais affaiblir un verify existant.
- **Tests E2E** (Playwright, `scripts/e2e/`, `./scripts/run-e2e.sh`) : pilotage
  réel de l'app dans un navigateur (auth réelle via magic link admin).
- **Pas de scope creep** : respecter les non-goals du PRD §7.
