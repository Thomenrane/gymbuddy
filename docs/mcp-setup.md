# Connecter Gym Buddy à Claude (MCP)

Le serveur MCP expose les données nutrition + training à Claude :
14 tools (cibles, journées, résumés, recettes, logs de repas, séances,
historique de charges, pesées). Transport : Streamable HTTP.

## URL du serveur

```
https://gymbuddy-alpha.vercel.app/api/mcp
```

## Authentification

Secret statique `MCP_SECRET`, accepté sur **deux canaux** (pas d'OAuth en
v1 — trade-off assumé : quiconque possède ce secret a accès complet) :

1. Header `Authorization: Bearer <MCP_SECRET>` — tests, clients qui
   supportent les headers custom (Claude Code, SDK…).
2. Paramètre d'URL `?key=<MCP_SECRET>` — canal additionnel requis par
   l'UI des connecteurs Claude.ai, qui n'offre pas de champ bearer.

⚠️ **Limite connue du canal `?key=`** : l'application ne logge jamais le
secret, mais les *request logs de la plateforme Vercel* enregistrent
l'URL complète, paramètres compris — c'est hors de notre contrôle.
La parade est la rotation du secret (ci-dessous). Ne partage jamais
l'URL complète.

## Rotation du secret (3 étapes)

1. Générer un nouveau secret : `openssl rand -base64 32`
2. Vercel → Settings → Environment Variables → remplacer `MCP_SECRET`
   → redéployer (Deployments → ⋯ → Redeploy).
3. Mettre à jour l'URL du connecteur dans Claude.ai (nouveau `?key=`)
   — et tout autre client utilisant l'ancien secret.

## Configuration côté Claude.ai

1. **Settings → Connectors → Add custom connector**
2. Nom : `Gym Buddy`
3. URL : `https://gymbuddy-alpha.vercel.app/api/mcp?key=<MCP_SECRET>`
   (remplacer par la valeur réelle — c'est le seul moyen de passer le
   secret dans cette UI ; laisser les champs OAuth vides)
4. Add, puis activer le connecteur dans une conversation
   (icône outils → Gym Buddy).

## Prérequis côté Vercel

La route lit la base avec la clé service role. Dans
**Vercel → Settings → Environment Variables**, il faut donc :

| Variable | Rôle |
|---|---|
| `MCP_SECRET` | auth bearer de la route (déjà en place) |
| `SUPABASE_SERVICE_ROLE_KEY` | accès données du serveur MCP (serveur uniquement) |

## Phrases de test (critère d'acceptation PRD §5)

- « Comment était ma semaine ? » → `get_summary`
- « Ma progression au développé couché ? » → `get_exercise_history`
- « Ajoute cette recette : … » → `add_recipe`
- « J'ai mangé le poke bowl à midi, portion 1.25 » → `log_meal`
- « J'ai fait ma séance Day 1 : squat 4×6 à 72,5 kg… » → `log_workout`

## Test manuel rapide (curl)

```bash
curl -s -X POST https://gymbuddy-alpha.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Réponse attendue : la liste des 14 tools. Sans le header Authorization :
HTTP 401.
