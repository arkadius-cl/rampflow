import { ReactNode, InputHTMLAttributes } from "react";
export interface AlertProps {
  tone?: "default" | "info" | "warning" | "destructive" | "offline";
  title?: string;
  icon?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}
export function Alert(props: AlertProps): JSX.Element;
