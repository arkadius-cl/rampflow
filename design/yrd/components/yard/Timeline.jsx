import React from "react";
import { Icon } from "../core/Icon.jsx";
import { STATUS, statusClasses } from "../status/StatusBadge.jsx";
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, "0");
/** Zeitleiste der Disposition: Zeilen = Rampen, Spalten = 15-Minuten-Raster. Zeigt Rampenzeit (nur Tenant). bookings: [{id,dock,start,end,status,carrier,label,conflict}]. */
export function Timeline({ docks = [], bookings = [], from = "06:00", to = "18:00", now, selectedId, onSelect, rowHeight = 44, showArrival = true, className = "" }) {
  const start = toMin(from), end = toMin(to), span = end - start;
  const hours = []; for (let m = start; m <= end; m += 60) hours.push(m);
  const pct = (t) => ((toMin(t) - start) / span) * 100;
  return (
    <div className={"w-full overflow-hidden rounded-md border border-border bg-card text-card-foreground " + className}>
      <div className="grid" style={{ gridTemplateColumns: "112px 1fr" }}>
        <div className="h-8 border-b border-r border-border bg-muted/60 px-3 text-xs font-medium text-muted-foreground flex items-center">Rampe</div>
        <div className="relative h-8 border-b border-border bg-muted/60">
          {hours.map((m) => <span key={m} className={"absolute top-0 h-full flex items-center text-xs text-muted-foreground tabular-nums " + (m === end ? "-translate-x-full pr-1" : m === start ? "pl-1" : "-translate-x-1/2")} style={{ left: ((m - start) / span) * 100 + "%" }}>{pad(m / 60)}:00</span>)}
        </div>
        {docks.map((d) => { const dock = typeof d === "string" ? { id: d, label: d } : d; return (
          <React.Fragment key={dock.id}>
            <div className="border-b border-r border-border px-3 flex flex-col justify-center" style={{ height: rowHeight }}><span className="font-medium">{dock.label}</span>{dock.hint ? <span className="text-xs text-muted-foreground truncate">{dock.hint}</span> : null}</div>
            <div className="relative border-b border-border" style={{ height: rowHeight, backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)", backgroundSize: (100 / (span / 60)) + "% 100%" }}>
              {bookings.filter((b) => b.dock === dock.id).map((b) => { const s = STATUS[b.status] || STATUS.scheduled; const c = statusClasses(s.token); const left = pct(b.start), width = pct(b.end) - left; const sel = b.id === selectedId; return (
                <button key={b.id} type="button" onClick={() => onSelect && onSelect(b)} aria-label={b.id + " " + (b.carrier || "") + " " + b.start + "–" + b.end + " " + s.label} aria-pressed={sel}
                  className={"absolute top-1 bottom-1 flex items-stretch overflow-hidden rounded-sm border text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring " + c.badge + " " + (sel ? "border-foreground ring-2 ring-ring" : b.conflict || s.token === "problem" ? "border-status-problem-solid border-dashed" : "border-transparent") + (s.strike ? " opacity-60" : "")}
                  style={{ left: left + "%", width: width + "%" }}>
                  <span className={"w-1 shrink-0 " + c.dot}></span>
                  <span className="flex min-w-0 flex-col justify-center px-1.5 leading-tight">
                    <span className="flex items-center gap-1 truncate font-medium"><Icon name={s.icon} size={11} />{b.carrier || b.id}{b.conflict ? <Icon name="AlertTriangle" size={11} className="text-status-problem-solid" /> : null}</span>
                    <span className="truncate tabular-nums opacity-80">{b.start}–{b.end}{showArrival && b.arrival ? " · Pforte bis " + b.arrival : ""}{b.label ? " · " + b.label : ""}</span>
                  </span>
                </button>); })}
              {now ? <span aria-hidden="true" className="absolute top-0 bottom-0 w-0.5 bg-status-problem-solid" style={{ left: pct(now) + "%" }}></span> : null}
            </div>
          </React.Fragment>); })}
      </div>
    </div>
  );
}
