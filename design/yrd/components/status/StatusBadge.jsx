import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Status einer Buchung → Token, Label, Icon. Farbe nie allein: immer Icon + Text. */
export const STATUS = {
  requested: { label: "angefragt", icon: "Clock", token: "requested" },
  scheduled: { label: "bestätigt", icon: "CalendarCheck", token: "scheduled" },
  "checked-in": { label: "eingecheckt", icon: "MapPin", token: "on-yard" },
  called: { label: "aufgerufen", icon: "Megaphone", token: "called" },
  "at-dock": { label: "an Rampe", icon: "Forklift", token: "at-dock" },
  done: { label: "abgefertigt", icon: "CheckCircle2", token: "done" },
  "checked-out": { label: "ausgecheckt", icon: "LogOut", token: "checked-out" },
  conflict: { label: "Konflikt", icon: "AlertTriangle", token: "problem" },
  "no-show": { label: "No-Show", icon: "UserX", token: "problem" },
  rejected: { label: "abgewiesen", icon: "Ban", token: "problem" },
  declined: { label: "abgelehnt", icon: "XCircle", token: "problem" },
  cancelled: { label: "storniert", icon: "MinusCircle", token: "cancelled", strike: true },
};
const bg = { requested: "bg-status-requested text-status-requested-foreground", scheduled: "bg-status-scheduled text-status-scheduled-foreground", "on-yard": "bg-status-on-yard text-status-on-yard-foreground", called: "bg-status-called text-status-called-foreground", "at-dock": "bg-status-at-dock text-status-at-dock-foreground", done: "bg-status-done text-status-done-foreground", "checked-out": "bg-status-checked-out text-status-checked-out-foreground", problem: "bg-status-problem text-status-problem-foreground", cancelled: "bg-status-cancelled text-status-cancelled-foreground" };
const dot = { requested: "bg-status-requested-solid", scheduled: "bg-status-scheduled-solid", "on-yard": "bg-status-on-yard-solid", called: "bg-status-called-solid", "at-dock": "bg-status-at-dock-solid", done: "bg-status-done-solid", "checked-out": "bg-status-checked-out-solid", problem: "bg-status-problem-solid", cancelled: "bg-status-cancelled-solid" };
export function statusClasses(token) { return { badge: bg[token] || bg.scheduled, dot: dot[token] || dot.scheduled }; }
/** Badge für den Buchungsstatus. size: sm (Tabelle) · default · lg (Halle/Fahrer). conflict=true hängt die Markierung „Konflikt“ an. */
export function StatusBadge({ status = "scheduled", size = "default", label, conflict = false, className = "" }) {
  const s = STATUS[status] || STATUS.scheduled;
  const sz = size === "lg" ? "h-10 px-3.5 text-md gap-2 [&_svg]:size-5" : size === "sm" ? "h-5 px-1.5 text-xs gap-1 [&_svg]:size-3" : "h-6 px-2 text-sm gap-1.5 [&_svg]:size-3.5";
  return (
    <span className={"inline-flex items-center " + className}>
      <span className={"inline-flex items-center rounded-sm font-medium whitespace-nowrap " + sz + " " + bg[s.token] + (s.strike ? " line-through decoration-1" : "")}>
        <Icon name={s.icon} size={16} />{label || s.label}
      </span>
      {conflict && status !== "conflict" ? <span className={"ml-1 inline-flex items-center rounded-sm font-medium whitespace-nowrap " + sz + " " + bg.problem}><Icon name="AlertTriangle" size={16} />Konflikt</span> : null}
    </span>
  );
}
