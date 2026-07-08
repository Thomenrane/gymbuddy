import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client Supabase du serveur MCP : service role (bypass RLS), sans session.
// La route /api/mcp est protégée par bearer MCP_SECRET en amont.
// ⚠️ SUPABASE_SERVICE_ROLE_KEY doit exister dans l'env du déploiement
// (variable serveur uniquement — jamais NEXT_PUBLIC).
let client: SupabaseClient | null = null;

export function mcpDb(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error(
        "MCP: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans l'environnement."
      );
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
