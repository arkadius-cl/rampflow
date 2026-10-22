import React from "react";
import { Icon } from "../core/Icon.jsx";
export const PUNCTUALITY = {
  early: { label: "früh", icon: "ArrowDownToLine", cls: "bg-punctual-early text-punctual-early-foreground" },
  "on-time": { label: "pünktlich", icon: "Check", cls: "bg-punctual-on-time text-punctual-on-time-foreground" },
  "late-tolerance": { label: "spät in Toleranz", icon: "Clock", cls: "bg-punctual-late-tolerance text-punctual-late-tolerance-foreground" },
  late: { label: "spät", icon: "AlertCircle", cls: "bg-punctual-late text-punctual-late-foreground" },
};
/** Pünktlichkeits-Chip: früh · pünktlich · spät in Toleranz · spät, mit Abweichung in Minuten (z. B. +12 min). */
export function PunctualityChip({ value = "on-time", deltaMin, size = "default", className = "" }) {
  const p = PUNCTUALITY[value] || PUNCTUALITY["on-time"];
  const sz = size === "lg" ? "h-10 px-3.5 text-md gap-2 [&_svg]:size-5" : size === "sm" ? "h-5 px-1.5 text-xs gap-1 [&_svg]:size-3" : "h-6 px-2 text-sm gap-1.5 [&_svg]:size-3.5";
  const d = deltaMin == null ? null : (deltaMin > 0 ? "+" : deltaMin < 0 ? "−" : "±") + Math.abs(deltaMin) + " min";
  return (
    <span className={"inline-flex items-center rounded-sm font-medium whitespace-nowrap " + sz + " " + p.cls + " " + className}>
      <Icon name={p.icon} size={16} />{p.label}{d ? <span className="tabular-nums opacity-80">{d}</span> : null}
    </span>
  );
}
