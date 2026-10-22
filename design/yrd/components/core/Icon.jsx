import React from "react";
/** Lucide-Icon aus dem UMD-Bundle (window.LucideReact). Fällt auf ein leeres Kästchen zurück, wenn das Bundle fehlt. */
export function Icon({ name, size = 16, strokeWidth = 2, className = "", ...rest }) {
  const L = typeof window !== "undefined" ? window.LucideReact : null;
  const Cmp = L && L[name];
  if (!Cmp) return <span aria-hidden="true" className={"inline-block shrink-0 rounded-sm bg-muted " + className} style={{ width: size, height: size }} {...rest}></span>;
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" className={"shrink-0 " + className} {...rest} />;
}
