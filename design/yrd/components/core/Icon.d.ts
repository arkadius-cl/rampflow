export interface IconProps {
  /** Lucide-Name in PascalCase, z. B. "Truck", "Check", "AlertTriangle" */
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}
export function Icon(props: IconProps): JSX.Element;
