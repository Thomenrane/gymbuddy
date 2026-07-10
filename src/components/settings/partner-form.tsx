"use client";

import { useState, useTransition } from "react";
import { updatePartnerProfile } from "@/app/(tabs)/today-actions";
import type { PartnerProfile } from "@/lib/partner-server";

const inputCls =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-muted";

export function PartnerForm({ partner }: { partner: PartnerProfile }) {
  const [active, setActive] = useState(partner.is_active);
  const [name, setName] = useState(partner.name);
  const [kcal, setKcal] = useState(String(partner.kcal));
  const [p, setP] = useState(String(partner.protein_g));
  const [g, setG] = useState(String(partner.carbs_g));
  const [l, setL] = useState(String(partner.fat_g));
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const n = (s: string) => Number(s.replace(",", "."));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    startTransition(async () => {
      const res = await updatePartnerProfile({
        name,
        kcal: n(kcal),
        protein_g: n(p),
        carbs_g: n(g),
        fat_g: n(l),
        is_active: active,
      });
      if ("error" in res) {
        setError(res.error);
        setStatus("error");
      } else {
        setStatus("saved");
      }
    });
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <span className="text-sm">
          <span className="block font-medium">Mode couple</span>
          <span className="block text-xs text-muted">
            Permet de logger un repas « pour deux » avec {name || "le partenaire"}.
            Le solo reste le défaut.
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="Activer le mode couple"
          onClick={() => setActive((v) => !v)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            active ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white transition-transform ${
              active ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Nom du partenaire</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Calories (kcal / jour)</span>
        <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className={inputCls} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Protéines (g)</span>
          <input inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Glucides (g)</span>
          <input inputMode="numeric" value={g} onChange={(e) => setG(e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Lipides (g)</span>
          <input inputMode="numeric" value={l} onChange={(e) => setL(e.target.value)} className={inputCls} />
        </label>
      </div>

      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}
      {status === "saved" && (
        <p role="status" className="text-sm text-accent">Profil partenaire enregistré.</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
      >
        {pending ? "Sauvegarde…" : "Enregistrer le partenaire"}
      </button>
    </form>
  );
}
