"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) {
      setErrorMsg(
        error.code === "over_email_send_rate_limit"
          ? "Quota d'emails atteint (2/heure). Réessaie dans une heure — les liens déjà reçus restent inutilisables."
          : `${error.message} (${error.code ?? error.status ?? "?"})`
      );
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">
        Gym Buddy
      </h1>
      {status === "sent" ? (
        <p className="text-center text-lg">
          Magic link envoyé 📬
          <br />
          <span className="text-sm text-muted">
            Ouvre l&apos;email sur ce téléphone.
          </span>
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="ton@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 rounded-md border border-border bg-surface px-4 text-lg outline-none focus:border-muted"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="h-14 rounded-md bg-primary text-lg font-semibold text-on-primary active:bg-primary-pressed disabled:opacity-50"
          >
            {status === "sending" ? "Envoi…" : "Recevoir le magic link"}
          </button>
          {status === "error" && (
            <p role="alert" className="text-center text-sm text-destructive">
              {errorMsg}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
