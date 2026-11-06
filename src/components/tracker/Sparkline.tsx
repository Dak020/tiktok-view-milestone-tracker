import { useId } from "react";

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const gradientId = useId();
  if (values.length < 2) {
    return <div className={`h-8 text-[11px] text-muted-foreground ${className ?? ""}`}>collecting data…</div>;
  }
  const w = 100;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`h-8 w-full ${className ?? ""}`} aria-hidden>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-fill)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--chart-fill)" stopOpacity={0} /></linearGradient></defs>
      <polyline points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={`url(#${gradientId})`} stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--chart-line)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
