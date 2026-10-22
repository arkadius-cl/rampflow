import React from "react";
import { Icon } from "../core/Icon.jsx";
export const inputBase = "w-full rounded-control border bg-background text-foreground placeholder:text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:bg-muted";
/** Input. mono=true für Kennzeichen, Buchungs- und Bestellnummern. invalid=true setzt Fehlerrahmen (vom FormField gesteuert). */
export function Input({ invalid = false, mono = false, icon, multiline = false, rows = 3, className = "", ...rest }) {
  const cls = inputBase + " " + (invalid ? "border-destructive focus-visible:ring-destructive" : "border-input") + (mono ? " font-mono uppercase tracking-wide" : "") + " " + className;
  if (multiline) return <textarea rows={rows} aria-invalid={invalid || undefined} className={cls + " px-3 py-2 text-base"} {...rest}></textarea>;
  return (
    <div className="relative w-full">
      {icon ? <Icon name={icon} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /> : null}
      <input aria-invalid={invalid || undefined} className={cls + " h-control text-base " + (icon ? "pl-9 pr-3" : "px-3")} {...rest} />
    </div>
  );
}
