import { notFound } from "next/navigation";
import { getExerciseCatalog, getTemplate } from "@/lib/training-server";
import { TemplateEditor } from "@/components/training/template-editor";

export const dynamic = "force-dynamic";

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) notFound();
  const catalog = (await getExerciseCatalog()).map((e) => ({
    id: e.id,
    name: e.name,
    note: e.note,
  }));

  const rows = (template.template_exercises ?? []).map((tex) => ({
    key: tex.id,
    exerciseId: tex.exercise_id,
    name: tex.exercise.name,
    sets: tex.default_sets == null ? "" : String(tex.default_sets),
    min: tex.default_reps_min == null ? "" : String(tex.default_reps_min),
    max: tex.default_reps_max == null ? "" : String(tex.default_reps_max),
    rpe: tex.target_rpe == null ? "" : String(tex.target_rpe),
    rest: tex.rest_seconds == null ? "" : String(tex.rest_seconds),
  }));

  return (
    <TemplateEditor
      id={template.id}
      initialName={template.name}
      initialRows={rows}
      catalog={catalog}
    />
  );
}
