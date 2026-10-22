import { ReactNode, InputHTMLAttributes } from "react";
/**
 * @startingPoint section="Bausteine" subtitle="Tabelle der Disposition" viewport="700x320"
 */
export interface TableProps {
  columns: Array<{ key: string; label: string; align?: "left" | "right"; width?: number | string; sortable?: boolean; mono?: boolean; render?: (row: any) => ReactNode }>;
  rows: any[];
  rowKey?: string;
  onRowClick?: (row: any) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (s: { key: string; dir: "asc" | "desc" }) => void;
  selectedKey?: string;
  dense?: boolean;
  empty?: string;
  caption?: string;
  className?: string;
}
export function Table(props: TableProps): JSX.Element;
