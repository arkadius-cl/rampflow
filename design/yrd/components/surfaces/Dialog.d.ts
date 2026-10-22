import { ReactNode, InputHTMLAttributes } from "react";
export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  size?: "sm" | "default" | "lg";
  children?: ReactNode;
  className?: string;
}
export function Dialog(props: DialogProps): JSX.Element;
