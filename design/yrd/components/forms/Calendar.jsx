import React from "react";
import { Icon } from "../core/Icon.jsx";
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const fmtDE = (d) => d ? WD[(d.getDay() + 6) % 7] + " " + String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." : "";
const same = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** Calendar – Monatsansicht, Woche beginnt montags. disabled(date) sperrt Tage (Feiertage, Vergangenheit). availability(date) → "free" | "few" | "full" färbt Punkte. */
export function Calendar({ value, onChange, month, onMonthChange, disabled, availability, today = new Date(2026, 9, 11), className = "" }) {
  const [m, setM] = React.useState(month || value || today);
  const cur = month || m;
  const go = (n) => { const d = new Date(cur.getFullYear(), cur.getMonth() + n, 1); onMonthChange ? onMonthChange(d) : setM(d); };
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cur.getFullYear(), cur.getMonth(), i + 1))];
  const dotCls = { free: "bg-status-done-solid", few: "bg-status-requested-solid", full: "bg-status-problem-solid" };
  return (
    <div className={"inline-block rounded-md border border-border bg-popover text-popover-foreground p-3 " + className}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-label="Vorheriger Monat" onClick={() => go(-1)} className="h-control-sm w-control-sm inline-flex items-center justify-center rounded-sm hover:bg-muted"><Icon name="ChevronLeft" size={16} /></button>
        <span className="font-medium">{MON[cur.getMonth()]} {cur.getFullYear()}</span>
        <button type="button" aria-label="Nächster Monat" onClick={() => go(1)} className="h-control-sm w-control-sm inline-flex items-center justify-center rounded-sm hover:bg-muted"><Icon name="ChevronRight" size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WD.map((w) => <div key={w} className="text-xs text-muted-foreground h-6 flex items-center justify-center">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={"e" + i}></div>;
          const dis = disabled ? disabled(d) : false; const sel = same(d, value); const av = availability ? availability(d) : null;
          return <button key={i} type="button" disabled={dis} aria-pressed={sel} aria-label={fmtDE(d)} onClick={() => onChange && onChange(d)}
            className={"relative mx-auto h-control-sm w-control-sm min-h-8 min-w-8 inline-flex items-center justify-center rounded-sm text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring " + (sel ? "bg-primary text-primary-foreground font-medium" : dis ? "text-muted-foreground/50 line-through" : "hover:bg-muted") + (same(d, today) && !sel ? " font-semibold underline underline-offset-4 decoration-primary" : "")}>
            {d.getDate()}{av && !sel && !dis ? <span aria-hidden="true" className={"absolute bottom-0.5 h-1 w-1 rounded-full " + dotCls[av]}></span> : null}
          </button>;
        })}
      </div>
    </div>
  );
}
