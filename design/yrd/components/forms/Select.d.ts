import { ReactNode, InputHTMLAttributes } from "react";
export interface SelectProps {
  options: Array<string | { value: string; label: string; hint?: string }>;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}
export function Select(props: SelectProps): JSX.Element;
