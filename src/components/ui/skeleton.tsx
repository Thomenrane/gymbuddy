// Blocs de squelette réutilisables (états de chargement instantanés).
// Monochrome, animate-pulse, sans texte.
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-raised ${className}`} />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg border border-border bg-surface ${className}`} />
  );
}
