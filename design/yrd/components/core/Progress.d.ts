import { ReactNode, InputHTMLAttributes } from "react";
export interface ProgressProps {
  value: number;
  label?: string;
  showValue?: boolean;
  tone?: "auto" | "primary" | "warn" | "problem" | "done";
  className?: string;
}
export function Progress(props: ProgressProps): JSX.Element;
