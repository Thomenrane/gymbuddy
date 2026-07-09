import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getActiveTemplates } from "@/lib/training-server";
import { NewTemplateButton } from "@/components/training/new-template-button";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await getActiveTemplates();

  return (
    <main className="space-y-4">
      <Link
        href="/training"
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        Training
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>

      <div className="space-y-2">
        {templates.map((t) => (
          <Link
            key={t.id}
            href={`/training/templates/${t.id}`}
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 active:bg-surface-raised"
          >
            <span className="font-medium">{t.name}</span>
            <span className="text-sm text-muted">
              {t.template_exercises?.length ?? 0} exos
            </span>
          </Link>
        ))}
        {templates.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Aucun template actif.
          </p>
        )}
      </div>

      <NewTemplateButton />
    </main>
  );
}
