import React from "react";
import { Icon } from "./Icon.jsx";
const opts = [
  { value: "light", label: "Hell", icon: "Sun" },
  { value: "dark", label: "Dunkel", icon: "Moon" },
  { value: "system", label: "Wie System", icon: "Monitor" },
];
/** Schalter „Darstellung: Hell · Dunkel · Wie System“. size="lg" für Gerätemenüs in der Halle (Handschuhe). */
export function ThemeSwitch({ value = "system", onChange, size = "default", showLabel = true, className = "" }) {
  const h = size === "lg" ? "h-control-primary px-5 text-md" : "h-control px-3 text-base";
  return (
    <div className={"inline-flex flex-col gap-1.5 " + className}>
      {showLabel ? <span className="text-sm text-muted-foreground">Darstellung</span> : null}
      <div role="radiogroup" aria-label="Darstellung" className="inline-flex rounded-control border border-border bg-muted p-0.5 gap-0.5">
        {opts.map((o) => {
          const on = o.value === value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange && onChange(o.value)}
              className={"inline-flex items-center gap-2 rounded-[calc(var(--radius)-2px)] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring " + h + " " + (on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Icon name={o.icon} size={size === "lg" ? 22 : 16} />{o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
