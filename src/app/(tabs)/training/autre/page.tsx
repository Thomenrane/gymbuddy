import { notFound } from "next/navigation";
import { brusselsDay, isIsoDate } from "@/lib/brussels-day.mjs";
import { getWorkout } from "@/lib/training-server";
import { CardioForm } from "@/components/training/cardio-form";

export const dynamic = "force-dynamic";

export default async function AutrePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; edit?: string }>;
}) {
  const { date: raw, edit } = await searchParams;
  let date = raw && isIsoDate(raw) ? raw : brusselsDay();
  let initial;
  if (edit) {
    const w = await getWorkout(edit);
    if (!w || (w.type !== "padel" && w.type !== "autre")) notFound();
    date = w.workout_date;
    initial = {
      type: w.type,
      distance: "",
      duration: w.duration_min == null ? "" : String(w.duration_min),
      runType: null,
      intensity: w.perceived_intensity,
      notes: w.notes ?? "",
    };
  }
  return (
    <CardioForm mode="autre" date={date} editId={edit ?? null} initial={initial} />
  );
}
