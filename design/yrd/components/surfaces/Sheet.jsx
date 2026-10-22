import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Sheet – Seitenpanel (Buchungsdetail mit Historie). side="right" Standard, Breite 480 px im Büro. Nicht modal: Zeitleiste bleibt sichtbar. */
export function Sheet({ open = false, onClose, title, description, children, footer, side = "right", width = 480, modal = false, className = "" }) {
  if (!open) return null;
  const pos = side === "left" ? "left-0 border-r" : "right-0 border-l";
  return (
    <>
      {modal ? <div className="fixed inset-0 z-40 bg-foreground/30" onClick={onClose}></div> : null}
      <aside role={modal ? "dialog" : "complementary"} aria-label={title} className={"fixed inset-y-0 z-50 flex flex-col border-border bg-background text-foreground shadow-lg " + pos + " " + className} style={{ width, maxWidth: "100%" }}>
        <header className="flex items-start justify-between gap-3 border-b border-border px-pad py-4">
          <div className="min-w-0"><h2 className="text-lg font-semibold leading-tight truncate">{title}</h2>{description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}</div>
          <button type="button" aria-label="Schließen" onClick={onClose} className="h-control-sm w-control-sm inline-flex items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Icon name="X" size={16} /></button>
        </header>
        <div className="flex-1 overflow-auto px-pad py-4">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-pad py-3">{footer}</footer> : null}
      </aside>
    </>
  );
}
