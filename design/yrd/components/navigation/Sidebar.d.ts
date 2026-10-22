import { ReactNode, InputHTMLAttributes } from "react";
export interface SidebarProps {
  brand?: string;
  context?: string;
  items: Array<{ id: string; label: string; icon?: string; count?: number; urgent?: boolean; section?: string }>;
  value?: string;
  onChange?: (id: string) => void;
  collapsed?: boolean;
  onToggle?: () => void;
  footer?: ReactNode;
  className?: string;
}
export function Sidebar(props: SidebarProps): JSX.Element;
