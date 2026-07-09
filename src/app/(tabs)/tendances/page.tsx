import { getTargets } from "@/lib/today-server";
import {
  getOilyFishWeek,
  getBodyTrends,
  getMealAverages,
  getProgressionSeries,
  getWeeklySessions,
} from "@/lib/trends-server";
import { WeightChart } from "@/components/trends/weight-chart";
import { WaistChart } from "@/components/trends/waist-chart";
import { ProgressionChart } from "@/components/trends/progression-chart";
import { AveragesPanel } from "@/components/trends/averages-panel";
import { SessionsChart } from "@/components/trends/sessions-chart";
import { OilyFishCounter } from "@/components/trends/oily-fish-counter";

export const dynamic = "force-dynamic";

// Onglet Tendances — les 6 visualisations du PRD §4 :
// poids (moyenne hebdo principale), tour de taille, progression des
// charges, moyennes 7j/30j vs cibles, poisson gras de la semaine,
// séances par semaine par type.
export default async function TendancesPage() {
  const [targets, body, meals, oilyFish, progression, sessions] = await Promise.all([
    getTargets(),
    getBodyTrends(),
    getMealAverages(),
    getOilyFishWeek(),
    getProgressionSeries(),
    getWeeklySessions(),
  ]);

  return (
    <main className="space-y-5">
      <h1 className="text-lg font-semibold tracking-tight">Tendances</h1>

      <section>
        <h2 className="mb-1.5 text-sm font-medium text-muted">Poids</h2>
        <WeightChart metrics={body.metrics} weekly={body.weekly} />
      </section>

      <section>
        <h2 className="mb-1.5 text-sm font-medium text-muted">Progression des charges</h2>
        <ProgressionChart series={progression} />
      </section>

      <section>
        <h2 className="mb-1.5 text-sm font-medium text-muted">Moyennes vs cibles</h2>
        <AveragesPanel d7={meals.d7} d30={meals.d30} targets={targets} />
      </section>

      <section>
        <h2 className="mb-1.5 text-sm font-medium text-muted">Poisson gras — semaine en cours</h2>
        <OilyFishCounter count={oilyFish.count} />
      </section>

      <section>
        <h2 className="mb-1.5 text-sm font-medium text-muted">Séances par semaine</h2>
        <SessionsChart weeks={sessions} />
      </section>

      <section>
        <h2 className="mb-1.5 text-sm font-medium text-muted">Tour de taille</h2>
        <WaistChart metrics={body.metrics} />
      </section>
    </main>
  );
}
