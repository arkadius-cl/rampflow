import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Sidebar der Büro-Apps (Tenant, Carrier, Plattform). 240 px, einklappbar auf 56 px. items: [{id,label,icon,count,section}]. Unten: Standort/Konto. */
export function Sidebar({ brand = "yrd", context, items = [], value, onChange, collapsed = false, onToggle, footer, className = "" }) {
  const sections = [...new Set(items.map((i) => i.section || ""))];
  return (
    <nav aria-label="Hauptnavigation" className={"flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground " + (collapsed ? "w-14" : "w-60") + " " + className}>
      <div className="flex h-14 items-center gap-2 px-3 border-b border-sidebar-border">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-semibold text-sm tracking-tight">{brand.slice(0, 3)}</span>
        {!collapsed ? <div className="min-w-0 leading-tight"><div className="font-semibold text-sm truncate">{brand}</div>{context ? <div className="text-xs text-muted-foreground truncate">{context}</div> : null}</div> : null}
        {onToggle ? <button type="button" aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"} onClick={onToggle} className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><Icon name={collapsed ? "PanelLeftOpen" : "PanelLeftClose"} size={16} /></button> : null}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {sections.map((s) => (
          <div key={s} className="mb-3">
            {s && !collapsed ? <div className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{s}</div> : null}
            <ul className="flex flex-col gap-0.5">
              {items.filter((i) => (i.section || "") === s).map((i) => { const on = i.id === value; return (
                <li key={i.id}><button type="button" aria-current={on ? "page" : undefined} title={collapsed ? i.label : undefined} onClick={() => onChange && onChange(i.id)}
                  className={"flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring " + (on ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                  {i.icon ? <Icon name={i.icon} size={18} className={on ? "text-sidebar-primary" : "text-muted-foreground"} /> : null}
                  {!collapsed ? <><span className="flex-1 truncate text-left">{i.label}</span>{i.count != null ? <span className={"inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1 text-xs tabular-nums " + (i.urgent ? "bg-status-problem text-status-problem-foreground" : "bg-muted text-muted-foreground")}>{i.count}</span> : null}</> : null}
                </button></li>); })}
            </ul>
          </div>
        ))}
      </div>
      {footer ? <div className="border-t border-sidebar-border p-2">{footer}</div> : null}
    </nav>
  );
}
