import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next 16 : proxy.ts remplace middleware.ts.
// Rafraîchit la session Supabase (cookies) et protège toutes les pages
// sauf /login et /auth/*. L'API MCP (Phase 4) gèrera sa propre auth bearer.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Perf : getClaims() vérifie le JWT LOCALEMENT (clés asymétriques, JWKS
  // en cache) au lieu d'un aller-retour réseau vers l'Auth Supabase à
  // CHAQUE navigation comme getUser(). Rafraîchit quand même la session
  // (lecture du cookie). Si le projet est encore en HS256, getClaims
  // retombe sur getUser (aucune régression). Rien entre createServerClient
  // et cet appel (doc Supabase SSR). La sécurité d'accès aux données reste
  // la RLS ; ici on ne fait qu'un aiguillage de route.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/mcp");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Tout sauf assets statiques, fichiers PWA et l'API MCP.
    // /api/mcp est exclu du middleware : il a sa propre auth bearer, et le
    // passage par le proxy Edge est inutile (getUser() par requête) et peut
    // altérer les headers en production.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|apple-icon|api/mcp).*)",
  ],
};
