# Gym Buddy

PWA perso de suivi nutrition + training (recomposition corporelle). Spec :
`PRD-app-recomp-v2.md` (hors repo) + amendements du programme v4.

## Stack

- Next.js 16 (App Router, `src/`), TypeScript, Tailwind 4 — mobile-first strict
- Supabase (Postgres + Auth magic link), RLS single-user
- Vercel (deploy auto via GitHub)
- Phase 4 : serveur MCP sur `/api/mcp` (bearer `MCP_SECRET`)

## Setup

```bash
npm install
cp .env.example .env.local   # remplir les valeurs
npm run dev
```

## Base de données

- Migrations : `supabase/migrations/` (appliquées via MCP Supabase ou CLI).
- Seed : `seed/*.json` sont la **source de vérité** (ne pas modifier).
  `node scripts/generate-seed-sql.mjs` régénère `supabase/seed.sql`
  (idempotent), à appliquer sur la base.
- Décisions de schéma (FLAG 5/6) documentées en tête de
  `supabase/migrations/20260708000001_schema_v2.sql`.

## Vérification de phase

Chaque phase a son contrat mécanique : `scripts/verify-phaseN.sh`
(exit 0 = Definition of Done atteinte). Phase 0 :

```bash
./scripts/verify-phase0.sh
```

Nécessite `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
et un accès réseau sortant vers `*.supabase.co`.

## Phases

| Phase | Contenu | Statut |
|---|---|---|
| 0 | Fondations : schéma, seed, PWA, auth | ✅ |
| 1 | Recettes (CRUD + dupliquer) | — |
| 2 | Aujourd'hui (log ≤2 taps, pesée, streak) | — |
| 3 | Training (templates, pré-remplissage charges) | — |
| 4 | MCP (14 tools) | — |
| 5 | Tendances | — |
