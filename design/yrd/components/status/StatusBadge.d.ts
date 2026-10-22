import { ReactNode, InputHTMLAttributes } from "react";
/**
 * @startingPoint section="Bausteine" subtitle="Statusbadges aller Zustände" viewport="700x320"
 */
export interface StatusBadgeProps {
  status: "requested" | "scheduled" | "checked-in" | "called" | "at-dock" | "done" | "checked-out" | "conflict" | "no-show" | "rejected" | "declined" | "cancelled";
  size?: "sm" | "default" | "lg";
  /** Label überschreiben (z. B. Übersetzung) */
  label?: string;
  /** Markierung „Konflikt“ zusätzlich anhängen */
  conflict?: boolean;
  className?: string;
}
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
