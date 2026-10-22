import React from "react";
import { Icon } from "../core/Icon.jsx";
const states = {
  free: { label: "frei", icon: "Circle", cls: "bg-card text-card-foreground border-border", bar: "bg-border" },
  called: { label: "aufgerufen", icon: "Megaphone", cls: "bg-status-called text-status-called-foreground border-status-called-solid", bar: "bg-status-called-solid" },
  "at-dock": { label: "an Rampe", icon: "Forklift", cls: "bg-status-at-dock text-status-at-dock-foreground border-status-at-dock-solid", bar: "bg-status-at-dock-solid" },
  done: { label: "abgefertigt", icon: "CheckCircle2", cls: "bg-status-done text-status-done-foreground border-status-done-solid", bar: "bg-status-done-solid" },
  problem: { label: "Problem", icon: "AlertTriangle", cls: "bg-status-problem text-status-problem-foreground border-status-problem-solid", bar: "bg-status-problem-solid" },
  blocked: { label: "gesperrt", icon: "Ban", cls: "bg-muted text-muted-foreground border-border", bar: "bg-status-cancelled-solid" },
};
/** Rampen-Kachel (Lager-App, Wallboard): ein Blick, ein Status. Touch-Ziel ≥ 56 px, in der Halle ganze Kachel tippbar. */
export function DockTile({ dock = "8", state = "free", plate, carrier, bookingId, since, onClick, size = "default", className = "" }) {
  const s = states[state] || states.free;
  const big = size === "lg";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={"relative flex flex-col overflow-hidden rounded-lg border-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " + (big ? "min-h-44 p-5" : "min-h-32 p-4") + " " + s.cls + " " + className}>
      <span aria-hidden="true" className={"absolute inset-x-0 top-0 h-1.5 " + s.bar}></span>
      <div className="flex items-start justify-between gap-2">
        <span className={"font-semibold tabular-nums leading-none " + (big ? "text-display" : "text-2xl")}>{dock}</span>
        <span className={"inline-flex items-center gap-1.5 font-medium whitespace-nowrap " + (big ? "text-md" : "text-sm")}><Icon name={s.icon} size={big ? 22 : 16} />{s.label}</span>
      </div>
      <div className="mt-auto pt-3 flex flex-col gap-0.5">
        {plate ? <span className={"font-mono font-semibold tracking-wide whitespace-nowrap " + (big ? "text-xl" : "text-md")}>{plate}</span> : <span className={"opacity-70 " + (big ? "text-md" : "text-sm")}>{state === "free" ? "Keine Buchung" : ""}</span>}
        {carrier || bookingId ? <span className={"truncate opacity-80 " + (big ? "text-md" : "text-sm")}>{[bookingId, carrier].filter(Boolean).join(" · ")}</span> : null}
        {since ? <span className={"tabular-nums opacity-80 " + (big ? "text-md" : "text-sm")}>seit {since}</span> : null}
      </div>
    </Tag>
  );
}
