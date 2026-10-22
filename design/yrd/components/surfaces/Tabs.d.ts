import { ReactNode, InputHTMLAttributes } from "react";
export interface TabsProps {
  tabs: Array<{ id: string; label: string; count?: number; icon?: string }>;
  value?: string;
  onChange?: (id: string) => void;
  variant?: "underline" | "segmented";
  children?: ReactNode | ((active: string) => ReactNode);
  className?: string;
}
export function Tabs(props: TabsProps): JSX.Element;
