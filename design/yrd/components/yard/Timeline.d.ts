import { ReactNode, InputHTMLAttributes } from "react";
/**
 * @startingPoint section="Bausteine" subtitle="Zeitleiste der Disposition" viewport="700x320"
 */
export interface TimelineProps {
  docks: Array<string | { id: string; label: string; hint?: string }>;
  bookings: Array<{ id: string; dock: string; start: string; end: string; status: string; carrier?: string; label?: string; arrival?: string; conflict?: boolean }>;
  from?: string;
  to?: string;
  now?: string;
  selectedId?: string;
  onSelect?: (b: any) => void;
  rowHeight?: number;
  showArrival?: boolean;
  className?: string;
}
export function Timeline(props: TimelineProps): JSX.Element;
