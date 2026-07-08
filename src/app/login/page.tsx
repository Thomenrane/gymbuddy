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
        Gym <span className="text-emerald-500">Buddy</span>
      </h1>
      {status === "sent" ? (
        <p className="text-center text-lg">
          Magic link envoyé 📬
          <br />
          <span className="text-sm text-neutral-400">
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
            className="h-14 rounded-xl border border-neutral-700 bg-neutral-900 px-4 text-lg outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="h-14 rounded-xl bg-emerald-600 text-lg font-semibold active:bg-emerald-700 disabled:opacity-50"
          >
            {status === "sending" ? "Envoi…" : "Recevoir le magic link"}
          </button>
          {status === "error" && (
            <p role="alert" className="text-center text-sm text-red-400">
              {errorMsg}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
