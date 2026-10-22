import React from "react";
import { Icon } from "../core/Icon.jsx";
const variants = { default: "bg-primary text-primary-foreground", secondary: "bg-secondary text-secondary-foreground", outline: "border border-border text-foreground", destructive: "bg-destructive text-destructive-foreground", proposal: "border border-dashed border-border text-muted-foreground" };
/** Badge (allgemein): Zähler, Kennzeichnungen, „Vorschlag“-Markierung (variant="proposal"). Für Buchungsstatus StatusBadge verwenden. */
export function Badge({ variant = "secondary", icon, children, className = "" }) {
  return <span className={"inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-xs font-medium whitespace-nowrap " + (variants[variant] || variants.secondary) + " " + className}>{icon ? <Icon name={icon} size={12} /> : null}{children}</span>;
}
