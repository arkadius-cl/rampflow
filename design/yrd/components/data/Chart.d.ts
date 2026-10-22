import { ReactNode, InputHTMLAttributes } from "react";
export interface ChartProps {
  type?: "bar" | "line";
  data?: Array<{ label: string; value: number }>;
  series?: Array<{ name: string; values: number[] }>;
  labels?: string[];
  height?: number;
  unit?: string;
  max?: number;
  className?: string;
}
export function Chart(props: ChartProps): JSX.Element;
