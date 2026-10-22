import React from "react";
/** Chart – Balken oder Linie ohne Bibliothek, Farben aus --chart-1…5. data: [{label, value}] oder series: [{name, values:[...]}]. Immer mit Achsenbeschriftung, nie nur Farbe. */
export function Chart({ type = "bar", data = [], series, labels, height = 160, unit = "", max, className = "" }) {
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
  const ser = series || [{ name: "", values: data.map((d) => d.value) }];
  const lab = labels || data.map((d) => d.label);
  const m = max || Math.max(1, ...ser.flatMap((s) => s.values)) * 1.1;
  const W = 100, H = 100;
  return (
    <figure className={"w-full " + className}>
      {series ? <figcaption className="mb-2 flex flex-wrap gap-3 text-sm text-muted-foreground">{series.map((s, i) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: palette[i % 5] }}></span>{s.name}</span>)}</figcaption> : null}
      <div className="relative" style={{ height }}>
        <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1="0" x2={W} y1={H - g * H} y2={H - g * H} stroke="var(--border)" strokeWidth="0.3" />)}
          {type === "bar" ? ser.map((s, si) => s.values.map((v, i) => { const n = lab.length, bw = W / n, gw = bw * 0.6 / ser.length; const x = i * bw + bw * 0.2 + si * gw; const h = (v / m) * H; return <rect key={si + "-" + i} x={x} y={H - h} width={gw} height={h} fill={palette[si % 5]} rx="0.5" />; }))
            : ser.map((s, si) => { const n = s.values.length; const pts = s.values.map((v, i) => (i / Math.max(1, n - 1)) * W + "," + (H - (v / m) * H)).join(" "); return <polyline key={si} points={pts} fill="none" stroke={palette[si % 5]} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />; })}
        </svg>
        <div className="absolute right-0 top-0 text-xs text-muted-foreground tabular-nums -translate-y-1/2">{Math.round(m / 1.1)}{unit}</div>
      </div>
      <div className="mt-1.5 grid text-xs text-muted-foreground tabular-nums" style={{ gridTemplateColumns: "repeat(" + lab.length + ",1fr)" }}>{lab.map((l, i) => <span key={i} className={type === "bar" ? "text-center" : i === 0 ? "text-left" : i === lab.length - 1 ? "text-right" : "text-center"}>{l}</span>)}</div>
    </figure>
  );
}
