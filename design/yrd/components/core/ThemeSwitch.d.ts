import { ReactNode, InputHTMLAttributes } from "react";
export interface ThemeSwitchProps {
  value?: "light" | "dark" | "system";
  onChange?: (v: "light" | "dark" | "system") => void;
  size?: "default" | "lg";
  showLabel?: boolean;
  className?: string;
}
export function ThemeSwitch(props: ThemeSwitchProps): JSX.Element;
