import { redirect } from "next/navigation";

// Lot 23 : le Plan de la semaine est devenu l'accueil (`/`). Cette route reste
// pour ne casser ni les liens existants ni un raccourci déjà installé sur
// l'écran d'accueil du téléphone — elle transmet la semaine demandée.
export default async function PlanRedirect({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  redirect(week ? `/?week=${week}` : "/");
}
