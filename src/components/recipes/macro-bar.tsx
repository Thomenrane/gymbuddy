// Signature visuelle de l'app : proportion des calories venant des
// protéines / glucides / lipides, en une barre fine à 3 segments.
export function MacroBar({
  protein,
  carbs,
  fat,
}: {
  protein: number;
  carbs: number;
  fat: number;
}) {
  const pKcal = protein * 4;
  const gKcal = carbs * 4;
  const lKcal = fat * 9;
  const total = pKcal + gKcal + lKcal || 1;

  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-border"
      role="img"
      aria-label={`Répartition calorique : protéines ${Math.round((pKcal / total) * 100)}%, glucides ${Math.round((gKcal / total) * 100)}%, lipides ${Math.round((lKcal / total) * 100)}%`}
    >
      <div className="bg-macro-p" style={{ width: `${(pKcal / total) * 100}%` }} />
      <div className="bg-macro-g" style={{ width: `${(gKcal / total) * 100}%` }} />
      <div className="bg-macro-l" style={{ width: `${(lKcal / total) * 100}%` }} />
    </div>
  );
}

export function MacroValues({
  protein,
  carbs,
  fat,
  className = "",
}: {
  protein: number;
  carbs: number;
  fat: number;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 text-sm ${className}`}>
      <span>
        <span className="font-semibold text-macro-p">{fmt(protein)}</span>
        <span className="text-muted"> P</span>
      </span>
      <span>
        <span className="font-semibold text-macro-g">{fmt(carbs)}</span>
        <span className="text-muted"> G</span>
      </span>
      <span>
        <span className="font-semibold text-macro-l">{fmt(fat)}</span>
        <span className="text-muted"> L</span>
      </span>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(1);
}
