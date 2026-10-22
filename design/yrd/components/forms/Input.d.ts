import { ReactNode, InputHTMLAttributes } from "react";
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  mono?: boolean;
  icon?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
}
export function Input(props: InputProps): JSX.Element;
