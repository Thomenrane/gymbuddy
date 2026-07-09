import { SkeletonBar, SkeletonCard } from "@/components/ui/skeleton";

// Squelette générique affiché INSTANTANÉMENT à la navigation (fallback
// Suspense du groupe (tabs)) — hérité par tous les onglets sans loading
// dédié. Le shell (barre d'onglets) reste monté ; seul le contenu change.
export default function TabsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement">
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-7 w-40" />
        <SkeletonBar className="h-7 w-10" />
      </div>
      <SkeletonCard className="h-24" />
      <SkeletonCard className="h-16" />
      <div className="space-y-3">
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-20" />
      </div>
    </div>
  );
}
