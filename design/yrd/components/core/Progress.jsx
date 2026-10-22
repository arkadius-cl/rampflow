import React from "react";
/** Progress – Auslastung einer Rampengruppe oder Fortschritt eines Imports. Wert 0–100. tone färbt ab Schwellen. */
export function Progress({ value = 0, label, showValue = true, tone = "auto", className = "" }) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone === "auto" ? (v >= 100 ? "bg-status-problem-solid" : v >= 85 ? "bg-status-requested-solid" : "bg-primary") : { primary: "bg-primary", warn: "bg-status-requested-solid", problem: "bg-status-problem-solid", done: "bg-status-done-solid" }[tone];
  return (
    <div className={"flex flex-col gap-1.5 " + className}>
      {label || showValue ? <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span>{showValue ? <span className="font-medium tabular-nums">{v} %</span> : null}</div> : null}
      <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 w-full rounded-full bg-muted overflow-hidden"><div className={"h-full rounded-full transition-[width] duration-300 " + t} style={{ width: v + "%" }}></div></div>
    </div>
  );
}
