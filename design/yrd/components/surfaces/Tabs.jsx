import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Tabs. variant="underline" (Seitenbereiche, Standard) oder "segmented" (Filter wie Heute · Morgen · Woche). tabs: [{id,label,count,icon}]. */
export function Tabs({ tabs = [], value, onChange, variant = "underline", className = "", children }) {
  const cur = value ?? (tabs[0] && tabs[0].id);
  return (
    <div className={className}>
      <div role="tablist" className={variant === "segmented" ? "inline-flex rounded-control border border-border bg-muted p-0.5 gap-0.5" : "flex gap-1 border-b border-border"}>
        {tabs.map((t) => { const on = t.id === cur; return (
          <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange && onChange(t.id)}
            className={variant === "segmented"
              ? "inline-flex h-[calc(var(--control-h)-4px)] items-center gap-2 rounded-[calc(var(--radius)-2px)] px-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring " + (on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
              : "relative inline-flex h-control items-center gap-2 px-3 text-base font-medium -mb-px border-b-2 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-sm " + (on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.icon ? <Icon name={t.icon} size={16} /> : null}{t.label}{t.count != null ? <span className={"inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1 text-xs tabular-nums " + (on ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{t.count}</span> : null}
          </button>); })}
      </div>
      {children ? <div role="tabpanel" className="pt-4">{typeof children === "function" ? children(cur) : children}</div> : null}
    </div>
  );
}
