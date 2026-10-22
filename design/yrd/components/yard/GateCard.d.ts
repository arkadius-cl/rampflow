import { ReactNode, InputHTMLAttributes } from "react";
/**
 * @startingPoint section="Bausteine" subtitle="Gate-Karte (Halle)" viewport="700x320"
 */
export interface GateCardProps {
  bookingId: string;
  plate: string;
  trailer?: string;
  carrier?: string;
  driver?: string;
  bookingType?: string;
  arrival: string;
  status?: string;
  punctuality?: "early" | "on-time" | "late-tolerance" | "late";
  deltaMin?: number;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string | null;
  onSecondary?: () => void;
  selected?: boolean;
  className?: string;
}
export function GateCard(props: GateCardProps): JSX.Element;
