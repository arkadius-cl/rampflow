import { ReactNode, InputHTMLAttributes } from "react";
export interface ToggleGroupProps {
  type?: "single" | "multiple";
  options: Array<string | { value: string; label: string; icon?: string }>;
  value?: string | string[] | null;
  onChange?: (v: any) => void;
  size?: "default" | "lg";
  className?: string;
}
export function ToggleGroup(props: ToggleGroupProps): JSX.Element;
