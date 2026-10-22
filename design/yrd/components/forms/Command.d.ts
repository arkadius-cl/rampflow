import { ReactNode, InputHTMLAttributes } from "react";
export interface CommandProps {
  groups: Array<{ heading: string; items: Array<{ id: string; label: string; hint?: string; icon?: string; shortcut?: string }> }>;
  placeholder?: string;
  onSelect?: (item: any) => void;
  /** ohne Schatten, eingebettet */
  inline?: boolean;
  className?: string;
}
export function Command(props: CommandProps): JSX.Element;
