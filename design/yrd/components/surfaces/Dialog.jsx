import React from "react";
import { Icon } from "../core/Icon.jsx";
/** Dialog (modal): Bestätigung vor jeder Umplanung. Esc schließt, Fokus bleibt im Dialog, Primäraktion rechts. */
export function Dialog({ open = false, onClose, title, description, children, footer, size = "default", className = "" }) {
  React.useEffect(() => { if (!open) return; const h = (e) => e.key === "Escape" && onClose && onClose(); document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-sm", default: "max-w-lg", lg: "max-w-2xl" }[size] || "max-w-lg";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className={"w-full rounded-lg border border-border bg-popover text-popover-foreground shadow-lg " + w + " " + className}>
        <div className="flex items-start justify-between gap-4 px-pad pt-pad">
          <div><h2 id="dlg-title" className="text-lg font-semibold leading-tight">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>
          {onClose ? <button type="button" aria-label="Schließen" onClick={onClose} className="h-control-sm w-control-sm inline-flex items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Icon name="X" size={16} /></button> : null}
        </div>
        {children ? <div className="px-pad py-4">{children}</div> : null}
        {footer ? <div className="flex flex-wrap justify-end gap-2 px-pad pb-pad">{footer}</div> : null}
      </div>
    </div>
  );
}
