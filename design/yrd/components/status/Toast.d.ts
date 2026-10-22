import { ReactNode, InputHTMLAttributes } from "react";
export interface ToastProps {
  tone?: "default" | "success" | "error" | "warning";
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  onClose?: () => void;
  className?: string;
}
export function Toast(props: ToastProps): JSX.Element;
