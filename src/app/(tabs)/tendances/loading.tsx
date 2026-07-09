import { SkeletonBar, SkeletonCard } from "@/components/ui/skeleton";

// Squelette dédié Tendances (graphiques) : titres de section + cartes
// à hauteur de courbe, pour un ressenti fidèle pendant le chargement.
export default function TendancesLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Chargement des tendances">
      <SkeletonBar className="h-7 w-32" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          <SkeletonBar className="mb-1.5 h-4 w-28" />
          <SkeletonCard className="h-40" />
        </div>
      ))}
    </div>
  );
}
