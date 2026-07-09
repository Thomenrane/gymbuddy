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
1. Passer la recette dans le script. Verdicts : **ok** (écart kcal ≤ 10 %),
   **à corriger** (ingrédients connus mais écart > 10 % → ajuster les macros aux
   valeurs recomposées avant d'encoder), **à vérifier** (ingrédient non
   référencé).
2. Pour un **ingrédient nouveau** : web-vérifier sa valeur /100 g (CIQUAL) et
   l'**ajouter à `scripts/lib/nutrition-ref.mjs`** dans la bonne table, puis
   relancer. Ne jamais laisser un ingrédient compté à zéro en silence.
3. Conventions de la table : viandes/poissons = **cru** ; féculents (riz, pâtes,
   quinoa, semoule, avoine) = poids **sec** ; poids par pièce et densités ml
   gérés. Ancres web : poulet cru 121/23, riz complet cru 356/7/77/2.2, bœuf 5 %
   130/22, avoine 372/13.5/58/7 (kcal/P/G/L par 100 g).
4. Signaler l'écart au PO ; n'encoder qu'après correction (verdict ok).

Test du garde-fou : `node scripts/nutrition-check.test.mjs` (prouve qu'une recette
sous-estimée est rejetée, une correcte acceptée, un ingrédient nouveau signalé).

> Ce contrôle vit **côté agent** (l'agent qui compose la recette lit ce fichier
> et a le web + le script). Le serveur `add_recipe` n'impose rien : si un jour on
> ajoute des recettes directement depuis le connecteur claude.ai (qui ne lit pas
> ce guide), prévoir un backstop serveur (recompute + rejet). Voir backlog.

## Discipline de travail

- **Challenge-first** : FLAG les divergences/ambiguïtés AVANT de coder.
- **Commits atomiques** : `tsc --noEmit` + `next build` verts à chaque commit.
- **Contrats de vérification** : chaque phase/lot a un `scripts/verify-*.sh` qui
  sort avec exit 0 ; ne jamais affaiblir un verify existant.
- **Tests E2E** (Playwright, `scripts/e2e/`, `./scripts/run-e2e.sh`) : pilotage
  réel de l'app dans un navigateur (auth réelle via magic link admin).
- **Pas de scope creep** : respecter les non-goals du PRD §7.
