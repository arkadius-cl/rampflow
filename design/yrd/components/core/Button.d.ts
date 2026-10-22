import { ButtonHTMLAttributes, ReactNode } from "react";
/**
 * @startingPoint section="Bausteine" subtitle="Button in allen Varianten und Dichten" viewport="700x300"
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** default = Primäraktion (eine pro Screen), secondary, outline, ghost, destructive, link */
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  /** default folgt --control-h; lg = Primärknopf der Halle (72 px); icon = quadratisch */
  size?: "sm" | "default" | "lg" | "icon";
  /** Lucide-Name links */
  icon?: string;
  /** Lucide-Name rechts */
  iconRight?: string;
  loading?: boolean;
  /** volle Breite */
  block?: boolean;
  children?: ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
