import { ReactNode, InputHTMLAttributes } from "react";
export interface PunctualityChipProps {
  value: "early" | "on-time" | "late-tolerance" | "late";
  /** Abweichung in Minuten, z. B. 12 → „+12 min“ */
  deltaMin?: number;
  size?: "sm" | "default" | "lg";
  className?: string;
}
export function PunctualityChip(props: PunctualityChipProps): JSX.Element;
