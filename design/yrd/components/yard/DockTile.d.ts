import { ReactNode, InputHTMLAttributes } from "react";
/**
 * @startingPoint section="Bausteine" subtitle="Rampen-Kachel" viewport="700x320"
 */
export interface DockTileProps {
  dock: string;
  state?: "free" | "called" | "at-dock" | "done" | "problem" | "blocked";
  plate?: string;
  carrier?: string;
  bookingId?: string;
  since?: string;
  onClick?: () => void;
  size?: "default" | "lg";
  className?: string;
}
export function DockTile(props: DockTileProps): JSX.Element;
