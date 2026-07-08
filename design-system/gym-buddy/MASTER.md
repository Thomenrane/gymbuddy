# Design System Master File — Gym Buddy

> Source de vérité pour toutes les phases UI. Direction fixée par le PO
> le 2026-07-08 (remplace la proposition "athlétique OLED/orange", rejetée).
> Quand tu construis une page, suis strictement ces règles.

**Direction : minimalisme fonctionnel monochrome** — niveau de finition
Vercel / Supabase / Linear. App dark-only, mobile-first, usage au pouce.

## Règles

1. **Base strictement monochrome.** Fond `#0a0a0a`, surfaces `#101010` /
   `#171717`, bordures 1px `#242424`, texte `#ededed`, secondaire `#a1a1a1`,
   estompé `#666666`. La hiérarchie passe par la graisse de police et les
   niveaux de gris — jamais par la couleur.
2. **Couleur = information, jamais décoration.** Une teinte n'apparaît que
   si elle porte un état, une progression ou une sémantique :
   - `--accent #3ecf8e` (vert sobre type Supabase) : progression,
     succès, protéines (KPI n°1 de la recomp).
   - `--destructive #e5484d` (rouge désaturé) : erreurs, actions
     destructives, dépassements.
   - Interdits : couleurs par catégorie, fonds colorés, gradients,
     ornements, icônes colorées décoratives.
3. **CTA monochromes** : bouton principal blanc (`#ededed`) sur noir,
   boutons secondaires bordés 1px, actions destructives en rouge sobre.
4. **Typographie : une seule famille (Geist)**, graisses 400/500/600/700.
   `tabular-nums` obligatoire sur tous les chiffres (kcal, macros, poids,
   charges). Pas de police display.
5. **Formes** : coins peu arrondis (`rounded-md`/`rounded-lg` max),
   bordures 1px, **zéro ombre décorative**, densité d'information élevée.
6. **Macro-bar** (composant signature conservé) : segments
   P `#3ecf8e` / G `#8f8f8f` / L `#4a4a4a` — le vert marque la protéine,
   le reste est encodé en gris. Valeurs texte blanches, labels gris,
   valeur protéines en vert.
7. **Icônes** : Phosphor (`@phosphor-icons/react`), monochromes,
   jamais d'emoji. Icône PWA monochrome (blanc sur `#0a0a0a`).
8. Accessibilité : contrastes AA minimum, touch targets ≥ 44px,
   `prefers-reduced-motion` respecté, focus visibles.

## Tokens

Définis dans `src/app/globals.css` (`:root` + `@theme inline`) — ne jamais
mettre de hex en dur dans un composant.
