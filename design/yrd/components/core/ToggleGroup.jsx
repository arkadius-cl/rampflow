import React from "react";
import { Icon } from "./Icon.jsx";
/** Toggle Group – z. B. Abweisungsgründe als Chips. type="single" | "multiple". Höhe folgt der Dichte. */
export function ToggleGroup({ type = "single", options = [], value, onChange, className = "", size = "default" }) {
  const selected = Array.isArray(value) ? value : value == null ? [] : [value];
  const toggle = (v) => {
    if (!onChange) return;
    if (type === "single") onChange(selected.includes(v) ? null : v);
    else onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  const h = size === "lg" ? "min-h-control-primary px-5 text-md" : "min-h-control px-3.5 text-base";
  return (
    <div role="group" className={"flex flex-wrap gap-gap " + className}>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        const on = selected.includes(opt.value);
        return (
          <button key={opt.value} type="button" aria-pressed={on} onClick={() => toggle(opt.value)}
            className={"inline-flex items-center gap-2 rounded-control border font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " + h + " " + (on ? "bg-accent text-accent-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted")}>
            {on ? <Icon name="Check" size={size === "lg" ? 22 : 16} /> : opt.icon ? <Icon name={opt.icon} size={size === "lg" ? 22 : 16} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
