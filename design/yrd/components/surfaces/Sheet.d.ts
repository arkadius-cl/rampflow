import { ReactNode, InputHTMLAttributes } from "react";
export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  side?: "left" | "right";
  width?: number;
  modal?: boolean;
  children?: ReactNode;
  className?: string;
}
export function Sheet(props: SheetProps): JSX.Element;
