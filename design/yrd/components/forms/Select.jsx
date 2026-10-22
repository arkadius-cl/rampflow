import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Select mit Popover-Liste. options: [{value,label,hint?}] oder Strings. Zeigt Ergebnis-Check, schließt bei Klick außerhalb. */
export function Select({ options = [], value, onChange, placeholder = "Auswählen …", invalid = false, disabled = false, className = "", ...rest }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const cur = opts.find((o) => o.value === value);
  return (
    <div ref={ref} className={"relative w-full " + className}>
      <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-invalid={invalid || undefined} onClick={() => setOpen(!open)} {...rest}
        className={"flex h-control w-full items-center justify-between gap-2 rounded-control border bg-background px-3 text-base text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 " + (invalid ? "border-destructive" : "border-input")}>
        <span className={cur ? "text-foreground truncate" : "text-muted-foreground truncate"}>{cur ? cur.label : placeholder}</span><Icon name="ChevronDown" size={16} className="text-muted-foreground" />
      </button>
      {open ? (
        <ul role="listbox" className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md p-1">
          {opts.map((o) => <li key={o.value} role="option" aria-selected={o.value === value} onClick={() => { onChange && onChange(o.value); setOpen(false); }}
            className={"flex min-h-control-sm items-center justify-between gap-2 rounded-sm px-2 py-1.5 cursor-pointer " + (o.value === value ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
            <span className="flex flex-col"><span>{o.label}</span>{o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}</span>{o.value === value ? <Icon name="Check" size={16} /> : null}
          </li>)}
        </ul>
      ) : null}
    </div>
  );
}
