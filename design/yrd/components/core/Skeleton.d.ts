import { ReactNode, InputHTMLAttributes } from "react";
export interface SkeletonProps {
  className?: string;
  /** Textzeilen statt Block */
  lines?: number;
}
export function Skeleton(props: SkeletonProps): JSX.Element;
