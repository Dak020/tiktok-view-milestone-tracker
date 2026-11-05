export function Sparkline({ values, className }: { values: number[]; className?: string }) {
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
      <polyline points={`0,${h} ${pts.join(" ")} ${w},${h}`} className="fill-primary/15 stroke-none" />
      <polyline points={pts.join(" ")} fill="none" className="stroke-primary" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
