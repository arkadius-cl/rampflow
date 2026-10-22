import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Calendar, fmtDE } from "./Calendar.jsx";
/** Date Picker – Trigger im Input-Stil, öffnet Calendar. Zeigt Datum als „Do 15.10.“. */
export function DatePicker({ value, onChange, placeholder = "Datum wählen", invalid = false, disabled, availability, className = "", ...rest }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} className={"relative inline-block " + className}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid || undefined} onClick={() => setOpen(!open)} {...rest}
        className={"flex h-control min-w-44 items-center gap-2 rounded-control border bg-background px-3 text-base text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " + (invalid ? "border-destructive" : "border-input")}>
        <Icon name="Calendar" size={16} className="text-muted-foreground" /><span className={value ? "" : "text-muted-foreground"}>{value ? fmtDE(value) : placeholder}</span>
      </button>
      {open ? <div className="absolute z-50 mt-1 shadow-md rounded-md"><Calendar value={value} onChange={(d) => { onChange && onChange(d); setOpen(false); }} disabled={disabled} availability={availability} /></div> : null}
    </div>
  );
}
