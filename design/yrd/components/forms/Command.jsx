import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Command – Suche mit Tastatur (⌘K / Strg+K). groups: [{heading, items:[{id,label,hint,icon,shortcut}]}]. Filtert nach Label und Hint. */
export function Command({ groups = [], placeholder = "Buchung, Kennzeichen, Carrier suchen …", onSelect, inline = false, className = "" }) {
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const flat = groups.flatMap((g) => g.items.filter((it) => !q || (it.label + " " + (it.hint || "")).toLowerCase().includes(q.toLowerCase())).map((it) => ({ ...it, heading: g.heading })));
  const onKey = (e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); } if (e.key === "Enter" && flat[active]) onSelect && onSelect(flat[active]); };
  let idx = -1;
  return (
    <div className={"w-full max-w-xl rounded-lg border border-border bg-popover text-popover-foreground " + (inline ? "" : "shadow-lg") + " " + className} onKeyDown={onKey}>
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Icon name="Search" size={16} className="text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder={placeholder} aria-label="Suche" className="h-control w-full bg-transparent text-base outline-none placeholder:text-muted-foreground" />
        <kbd className="hidden sm:inline-flex h-5 items-center rounded-sm border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground">Esc</kbd>
      </div>
      <div role="listbox" className="max-h-80 overflow-auto p-1">
        {flat.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nichts gefunden.</div> : null}
        {groups.map((g) => { const items = flat.filter((f) => f.heading === g.heading); if (!items.length) return null; return (
          <div key={g.heading} className="py-1">
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{g.heading}</div>
            {items.map((it) => { idx++; const i = idx; return (
              <div key={it.id} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => onSelect && onSelect(it)} className={"flex min-h-control-sm items-center gap-2 rounded-sm px-2 py-1.5 cursor-pointer " + (i === active ? "bg-accent text-accent-foreground" : "")}>
                {it.icon ? <Icon name={it.icon} size={16} className="text-muted-foreground" /> : null}<span className="flex-1 truncate">{it.label}</span>{it.hint ? <span className="text-xs text-muted-foreground tabular-nums">{it.hint}</span> : null}{it.shortcut ? <kbd className="font-mono text-xs text-muted-foreground">{it.shortcut}</kbd> : null}
              </div>); })}
          </div>); })}
      </div>
    </div>
  );
}
