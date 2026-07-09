// Petites échelles pour les SVG des Tendances — pas de lib de charts
// (non-goal PRD §7 : pas de dépendance lourde pour 4 courbes).

export const CHART_W = 360;
export const CHART_H = 140;
export const PAD = { top: 10, right: 8, bottom: 18, left: 34 };

export type XY = { x: number; y: number };

const dayNum = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86400000;

/** Échelle X temporelle : dates ISO → pixels [left, W-right]. */
export function xScale(dates: string[]) {
  const nums = dates.map(dayNum);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  return (iso: string) =>
    PAD.left + ((dayNum(iso) - min) / span) * (CHART_W - PAD.left - PAD.right);
}

/** Échelle Y linéaire : [min, max] (avec marge) → pixels inversés. */
export function yScale(values: number[], padRatio = 0.08) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * padRatio;
  const lo = min - pad;
  const hi = max + pad;
  return {
    y: (v: number) => PAD.top + ((hi - v) / (hi - lo)) * (CHART_H - PAD.top - PAD.bottom),
    lo,
    hi,
  };
}

export const polyline = (pts: XY[]) =>
  pts.map((p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(" ");

export const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
export const fmtDate = (iso: string) => DATE_FMT.format(new Date(`${iso}T12:00:00Z`));
