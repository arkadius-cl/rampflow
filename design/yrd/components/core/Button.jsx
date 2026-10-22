import React from "react";
import { Icon } from "./Icon.jsx";
const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium rounded-control border transition-colors duration-150 ease-yrd select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none active:translate-y-px";
const variants = {
  default: "bg-primary text-primary-foreground border-transparent hover:brightness-110 dark:hover:brightness-95",
  secondary: "bg-secondary text-secondary-foreground border-transparent hover:bg-accent hover:text-accent-foreground",
  outline: "bg-background text-foreground border-border hover:bg-muted",
  ghost: "bg-transparent text-foreground border-transparent hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground border-transparent hover:brightness-110",
  link: "bg-transparent text-primary border-transparent underline underline-offset-4 hover:text-accent-foreground",
};
const sizes = {
  sm: "h-control-sm px-3 text-sm",
  default: "h-control px-4 text-base",
  lg: "h-control-primary px-6 text-md",
  icon: "h-control w-control p-0",
};
/** Button in den Varianten von shadcn/ui. Höhe folgt der Dichte (--control-h), size="lg" ist der eine Primärknopf der Halle (72 px). */
export function Button({ variant = "default", size = "default", icon, iconRight, loading = false, block = false, className = "", children, ...rest }) {
  const iconSize = size === "lg" ? 24 : size === "sm" ? 14 : 16;
  return (
    <button type="button" className={[base, variants[variant] || variants.default, sizes[size] || sizes.default, block ? "w-full" : "", className].join(" ")} aria-busy={loading || undefined} disabled={rest.disabled || loading} {...rest}>
      {loading ? <Icon name="Loader2" size={iconSize} className="animate-spin" /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={iconSize} /> : null}
    </button>
  );
}
