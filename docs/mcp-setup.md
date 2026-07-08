# Connecter Gym Buddy à Claude (MCP)

Le serveur MCP expose les données nutrition + training à Claude :
14 tools (cibles, journées, résumés, recettes, logs de repas, séances,
historique de charges, pesées). Transport : Streamable HTTP.

## URL du serveur

```
https://gymbuddy-alpha.vercel.app/api/mcp
```

## Authentification

Bearer token statique : la valeur de la variable d'environnement
`MCP_SECRET` (la même que dans Vercel). Pas d'OAuth en v1 — trade-off
assumé : quiconque possède ce token a accès complet aux données.
En cas de fuite : générer un nouveau secret (`openssl rand -base64 32`),
le remplacer dans Vercel **et** dans le connecteur, redéployer.

## Configuration côté Claude.ai

1. **Settings → Connectors → Add custom connector**
2. Nom : `Gym Buddy`
3. URL : `https://gymbuddy-alpha.vercel.app/api/mcp`
4. Section avancée → **Authorization header / Bearer token** : coller la
   valeur de `MCP_SECRET` (jamais dans le champ URL).
5. Sauvegarder, puis activer le connecteur dans une conversation
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
