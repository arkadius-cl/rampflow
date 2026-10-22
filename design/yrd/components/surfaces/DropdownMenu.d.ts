import { ReactNode, InputHTMLAttributes } from "react";
export interface DropdownMenuProps {
  trigger: ReactNode;
  items: Array<{ id?: string; label?: string; icon?: string; shortcut?: string; destructive?: boolean; disabled?: boolean; separator?: boolean; heading?: string; custom?: ReactNode }>;
  onSelect?: (id: string) => void;
  align?: "start" | "end";
  className?: string;
}
export function DropdownMenu(props: DropdownMenuProps): JSX.Element;
