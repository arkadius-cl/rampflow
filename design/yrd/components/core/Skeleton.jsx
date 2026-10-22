import React from "react";
/** Skeleton – Ladeplatzhalter. Keine Spinner für Inhalte, nur für Aktionen (Button loading). */
export function Skeleton({ className = "", lines = 0 }) {
  if (lines > 0) return <div className={"flex flex-col gap-2 " + className}>{Array.from({ length: lines }).map((_, i) => <div key={i} className={"h-3.5 rounded-sm bg-muted animate-pulse " + (i === lines - 1 ? "w-2/3" : "w-full")}></div>)}</div>;
  return <div aria-hidden="true" className={"rounded-md bg-muted animate-pulse " + className}></div>;
}
