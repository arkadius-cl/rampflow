import { ReactNode, InputHTMLAttributes } from "react";
export interface BadgeProps {
  variant?: "default" | "secondary" | "outline" | "destructive" | "proposal";
  icon?: string;
  children?: ReactNode;
  className?: string;
}
export function Badge(props: BadgeProps): JSX.Element;
