import { ReactNode, InputHTMLAttributes } from "react";
export interface TooltipProps {
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
  className?: string;
}
export function Tooltip(props: TooltipProps): JSX.Element;
