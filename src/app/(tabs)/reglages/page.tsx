import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getTargets } from "@/lib/today-server";
import { getPartnerProfile } from "@/lib/partner-server";
import { getAllFoodPreferences } from "@/lib/food-prefs-server";
import { TargetsForm } from "@/components/settings/targets-form";
import { PartnerForm } from "@/components/settings/partner-form";
import { FoodPreferences } from "@/components/settings/food-preferences";

export const dynamic = "force-dynamic";

export default async function ReglagesPage() {
  const [targets, partner, prefs] = await Promise.all([
    getTargets(),
    getPartnerProfile(),
    getAllFoodPreferences(),
  ]);
  const florianPrefs = prefs.filter((p) => p.person === "florian");
  const sarahPrefs = prefs.filter((p) => p.person === "sarah");

  return (
    <main className="space-y-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        Aujourd&apos;hui
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">
          Cibles journalières
        </h2>
        <TargetsForm targets={targets} />
        <p className="mt-2 text-xs text-muted">
          Protocole : ajuste selon la moyenne hebdo de poids après ~3 semaines.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Mode couple</h2>
        <PartnerForm partner={partner} />
        <p className="mt-2 text-xs text-muted">
          {partner.name} est un profil de macros, pas un compte. Un repas « pour
          deux » n&apos;enregistre que ta part ; la sienne est calculée à
          l&apos;affichage et n&apos;affecte jamais tes tendances.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">
          Préférences alimentaires
        </h2>
        <div className="space-y-3">
          <FoodPreferences person="florian" personLabel="Florian" preferences={florianPrefs} />
          {partner.is_active && (
            <FoodPreferences person="sarah" personLabel={partner.name} preferences={sarahPrefs} />
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Claude lit ces préférences à la planification pour ne jamais proposer
          un aliment rejeté. Pas de filtrage automatique des recettes dans
          l&apos;app.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">
          Connecteur Claude (MCP)
        </h2>
        <div className="space-y-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <p className="break-all font-medium">
            https://gymbuddy-alpha.vercel.app/api/mcp
          </p>
          <p className="text-muted">
            Claude.ai → Settings → Connectors → Add custom connector, avec le
            bearer token <span className="font-medium">MCP_SECRET</span> (voir
            docs/mcp-setup.md du repo). Tools : logs, séances, recettes,
            résumés, plan, profil partenaire (mode couple).
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Training</h2>
        <Link
          href="/training/templates"
          className="block rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium active:bg-surface-raised"
        >
          Gérer les templates de séances
        </Link>
      </section>
    </main>
  );
}
