import { ReactNode, InputHTMLAttributes } from "react";
/**
 * @startingPoint section="Bausteine" subtitle="Aufruf-Vollbild (Fahrer)" viewport="700x320"
 */
export interface CallScreenProps {
  lang?: "de" | "pl";
  mode?: "called" | "waiting";
  dock?: string;
  hall?: string;
  plate?: string;
  arrival?: string;
  onAck?: () => void;
  onHelp?: () => void;
  className?: string;
}
export function CallScreen(props: CallScreenProps): JSX.Element;
