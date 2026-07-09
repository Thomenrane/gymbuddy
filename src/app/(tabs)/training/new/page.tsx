import Link from "next/link";
import { ArrowLeft, Barbell, PersonSimpleRun, TennisBall } from "@phosphor-icons/react/dist/ssr";
import { brusselsDay, isIsoDate } from "@/lib/brussels-day.mjs";
import { getActiveTemplates } from "@/lib/training-server";

export const dynamic = "force-dynamic";

export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: raw } = await searchParams;
  const date = raw && isIsoDate(raw) ? raw : brusselsDay();
  const templates = await getActiveTemplates();

  return (
    <main className="space-y-5">
      <Link
        href={`/training/day/${date}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted"
      >
        <ArrowLeft size={16} aria-hidden />
        {date}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Nouvelle séance</h1>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted">
          <Barbell size={16} aria-hidden /> Muscu
        </h2>
        <div className="space-y-2">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/training/muscu?template=${t.id}&date=${date}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 active:bg-surface-raised"
            >
              <span className="font-medium">{t.name}</span>
              <span className="text-sm text-muted">
                {t.template_exercises?.length ?? 0} exos
              </span>
            </Link>
          ))}
          <Link
            href={`/training/muscu?date=${date}`}
            className="flex h-11 items-center justify-center rounded-lg border border-dashed border-border text-sm font-medium text-muted active:bg-surface"
          >
            Séance vierge
          </Link>
        </div>
      </section>

      <section className="space-y-2">
        <Link
          href={`/training/running?date=${date}`}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-3.5 font-medium active:bg-surface-raised"
        >
          <PersonSimpleRun size={20} aria-hidden />
          Running
        </Link>
        <Link
          href={`/training/autre?date=${date}`}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-3.5 font-medium active:bg-surface-raised"
        >
          <TennisBall size={20} aria-hidden />
          Padel / Autre
        </Link>
      </section>
    </main>
  );
}
