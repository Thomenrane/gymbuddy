import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cible du magic link : vérifie le token puis redirige vers l'app.
// Gère les deux formats d'email Supabase :
//  - template personnalisé (recommandé) : ?token_hash=...&type=email
//    → verifyOtp, fonctionne même si l'email s'ouvre dans un autre navigateur
//  - template par défaut : ?code=... (PKCE)
//    → exchangeCodeForSession, requiert le même navigateur que la demande
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=1", request.url));
}
