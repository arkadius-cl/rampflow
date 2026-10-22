import React from "react";
/** Card: Rahmen 1 px, Radius lg, kein Schatten in der Fläche (Schatten nur für schwebende Ebenen). */
export function Card({ title, description, actions, footer, padded = true, className = "", children }) {
  return (
    <section className={"rounded-lg border border-border bg-card text-card-foreground " + className}>
      {title || actions ? <header className="flex items-start justify-between gap-3 px-pad pt-pad"><div><h3 className="text-md font-semibold leading-tight">{title}</h3>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>{actions ? <div className="flex gap-2 shrink-0">{actions}</div> : null}</header> : null}
      <div className={padded ? "px-pad py-pad" : ""}>{children}</div>
      {footer ? <footer className="flex items-center gap-2 border-t border-border px-pad py-3">{footer}</footer> : null}
    </section>
  );
}
