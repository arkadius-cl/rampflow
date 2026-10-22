import { ReactNode, InputHTMLAttributes } from "react";
export interface CardProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
  children?: ReactNode;
  className?: string;
}
export function Card(props: CardProps): JSX.Element;
