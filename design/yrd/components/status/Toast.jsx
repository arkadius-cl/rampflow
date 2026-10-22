import React from "react";
import { Icon } from "../core/Icon.jsx";
const tones = { default: "Info", success: "CheckCircle2", error: "AlertCircle", warning: "AlertTriangle" };
const colors = { default: "text-foreground", success: "text-status-done-solid", error: "text-status-problem-solid", warning: "text-status-requested-solid" };
/** Toast (Sonner-Stil): unten rechts, max. 3 gleichzeitig, mit Rückgängig-Aktion wo sinnvoll. */
export function Toast({ tone = "default", title, description, action, onClose, className = "" }) {
  return (
    <div role="status" className={"flex items-start gap-3 w-[360px] max-w-full rounded-lg border border-border bg-popover text-popover-foreground shadow-lg px-4 py-3 " + className}>
      <Icon name={tones[tone] || tones.default} size={18} className={"mt-0.5 " + (colors[tone] || colors.default)} />
      <div className="flex-1 min-w-0"><div className="font-medium">{title}</div>{description ? <div className="text-sm text-muted-foreground mt-0.5">{description}</div> : null}</div>
      {action ? <button type="button" onClick={action.onClick} className="text-sm font-medium text-primary hover:underline underline-offset-4 shrink-0">{action.label}</button> : null}
      {onClose ? <button type="button" aria-label="Schließen" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground"><Icon name="X" size={16} /></button> : null}
    </div>
  );
}
