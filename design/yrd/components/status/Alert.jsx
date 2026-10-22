import React from "react";
import { Icon } from "../core/Icon.jsx";
const tones = {
  default: { wrap: "bg-card text-card-foreground border-border", icon: "Info" },
  info: { wrap: "bg-accent text-accent-foreground border-transparent", icon: "Info" },
  warning: { wrap: "bg-status-requested text-status-requested-foreground border-transparent", icon: "AlertTriangle" },
  destructive: { wrap: "bg-status-problem text-status-problem-foreground border-transparent", icon: "AlertCircle" },
  offline: { wrap: "bg-foreground text-background border-transparent", icon: "WifiOff" },
};
/** Alert. tone="offline" ist das Hallen-Banner „Offline · letzte Aktualisierung 14:02“ (volle Breite, oben). */
export function Alert({ tone = "default", title, children, icon, action, className = "" }) {
  const t = tones[tone] || tones.default;
  return (
    <div role={tone === "destructive" || tone === "offline" ? "alert" : "status"} className={"flex items-start gap-3 rounded-md border px-pad py-3 " + t.wrap + " " + className}>
      <Icon name={icon || t.icon} size={20} className="mt-0.5" />
      <div className="flex-1 min-w-0">{title ? <div className="font-semibold">{title}</div> : null}{children ? <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div> : null}</div>
      {action}
    </div>
  );
}
/** Offline-Banner der Halle: fester Text, Zeit der letzten Aktualisierung. */
export function OfflineBanner({ lastUpdate = "14:02", className = "" }) {
  return <Alert tone="offline" className={"rounded-none justify-center text-md font-medium " + className}><span>Offline · letzte Aktualisierung <span className="tabular-nums">{lastUpdate}</span></span></Alert>;
}
