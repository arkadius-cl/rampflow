import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Dropdown Menu – Benutzermenü, Zeilenaktionen. items: [{id,label,icon,shortcut,destructive,disabled}] oder {separator:true} oder {heading}. */
export function DropdownMenu({ trigger, items = [], onSelect, align = "end", className = "" }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; const k = (e) => e.key === "Escape" && setOpen(false); document.addEventListener("mousedown", h); document.addEventListener("keydown", k); return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); }; }, []);
  return (
    <div ref={ref} className={"relative inline-block " + className}>
      <span onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>{trigger}</span>
      {open ? (
        <div role="menu" className={"absolute z-50 mt-1 min-w-56 rounded-md border border-border bg-popover text-popover-foreground shadow-md p-1 " + (align === "end" ? "right-0" : "left-0")}>
          {items.map((it, i) => it.separator ? <div key={i} role="separator" className="my-1 h-px bg-border"></div> : it.heading ? <div key={i} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{it.heading}</div> : it.custom ? <div key={i} className="px-2 py-1.5">{it.custom}</div> : (
            <button key={it.id || i} type="button" role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); onSelect && onSelect(it.id); }}
              className={"flex w-full min-h-control-sm items-center gap-2 rounded-sm px-2 py-1.5 text-left text-base outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50 " + (it.destructive ? "text-destructive" : "")}>
              {it.icon ? <Icon name={it.icon} size={16} className={it.destructive ? "" : "text-muted-foreground"} /> : null}<span className="flex-1">{it.label}</span>{it.shortcut ? <kbd className="font-mono text-xs text-muted-foreground">{it.shortcut}</kbd> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
