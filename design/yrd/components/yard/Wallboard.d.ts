import { ReactNode, InputHTMLAttributes } from "react";
/**
 * @startingPoint section="Bausteine" subtitle="Wallboard (TV)" viewport="700x320"
 */
export interface WallboardProps {
  title?: string;
  clock?: string;
  updated?: string;
  rows: Array<{ plate: string; dock?: string; state: "called" | "at-dock" | "waiting"; since?: string }>;
  offline?: boolean;
  className?: string;
}
export function Wallboard(props: WallboardProps): JSX.Element;
