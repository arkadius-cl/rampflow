import { SortOrder } from '@rampflow/shared/values';
import type { CellData, Column, RowData } from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { dataTableFeatures } from './data-table';

/** A sortable header is a button with a direction icon; any other header is plain text. */
export function DataTableColumnHeader<TData extends RowData, TValue extends CellData>({
  column,
  title,
}: {
  column: Column<typeof dataTableFeatures, TData, TValue>;
  title: string;
}) {
  const { t } = useTranslation();
  if (!column.getCanSort()) return <span>{title}</span>;
  const sorted = column.getIsSorted();
  const Icon =
    sorted === SortOrder.asc
      ? ArrowUpIcon
      : sorted === SortOrder.desc
        ? ArrowDownIcon
        : ChevronsUpDownIcon;
  // The design's sort control (design/yrd/components/data/Table.jsx): text, a 12 px icon, no padding.
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        sorted && 'text-foreground',
      )}
      onClick={() => column.toggleSorting(sorted === SortOrder.asc)}
    >
      {title}
      <Icon className="size-3" aria-hidden />
      {sorted ? (
        <span className="sr-only">
          {sorted === SortOrder.asc
            ? t(($) => $['data-table'].sorted_asc)
            : t(($) => $['data-table'].sorted_desc)}
        </span>
      ) : null}
    </button>
  );
}
