import React from "react";
/** Tooltip: erscheint bei Hover und Tastaturfokus. Nur für Zusatzinfo, nie für Pflichtinhalte (Halle hat keinen Hover). */
export function Tooltip({ content, side = "top", children, className = "" }) {
  const [open, setOpen] = React.useState(false);
  const pos = { top: "bottom-full left-1/2 -translate-x-1/2 mb-2", bottom: "top-full left-1/2 -translate-x-1/2 mt-2", left: "right-full top-1/2 -translate-y-1/2 mr-2", right: "left-full top-1/2 -translate-y-1/2 ml-2" }[side];
  return (
    <span className={"relative inline-flex " + className} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      {open ? <span role="tooltip" className={"absolute z-50 whitespace-nowrap rounded-md bg-foreground text-background text-sm px-2.5 py-1.5 shadow-md pointer-events-none " + pos}>{content}</span> : null}
    </span>
  );
}
