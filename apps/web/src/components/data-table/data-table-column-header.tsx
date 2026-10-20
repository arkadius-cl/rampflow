import { SortOrder } from '@rampflow/shared/values';
import type { CellData, Column, RowData } from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 text-sm font-medium"
      onClick={() => column.toggleSorting(sorted === SortOrder.asc)}
    >
      {title}
      <Icon aria-hidden />
      {sorted ? (
        <span className="sr-only">
          {sorted === SortOrder.asc
            ? t(($) => $['data-table'].sorted_asc)
            : t(($) => $['data-table'].sorted_desc)}
        </span>
      ) : null}
    </Button>
  );
}
