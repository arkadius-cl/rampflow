import { type ListPage, type PageSize, pageSizes } from '@rampflow/shared/contract/list';
import type { ReactTable, RowData } from '@tanstack/react-table';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { dataTableFeatures } from './data-table';

const SIZE_ITEMS = pageSizes.map((size) => ({ value: size, label: String(size) }));

/** The live result range, the page size and the paging buttons. */
export function DataTablePagination<TData extends RowData>({
  table,
  shown,
}: {
  table: ReactTable<typeof dataTableFeatures, TData>;
  /** The page on screen, `undefined` before the first one arrived. */
  shown: ListPage<unknown> | undefined;
}) {
  const { t } = useTranslation();
  const sizeId = useId();
  const { pageIndex, pageSize } = table.state.pagination;
  const pages = Math.max(table.getPageCount(), 1);
  // The range describes the rows on screen, which stay until the requested page arrives.
  const from = shown ? (shown.page - 1) * shown.pageSize + 1 : 0;
  const to = shown ? from + shown.items.length - 1 : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-1 text-sm">
      <p aria-live="polite" className="text-muted-foreground tabular-nums">
        {shown === undefined
          ? null
          : shown.items.length === 0
            ? t(($) => $['data-table'].range_empty, { total: shown.total })
            : t(($) => $['data-table'].range, { from, to, total: shown.total })}
      </p>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Label htmlFor={sizeId}>{t(($) => $['data-table'].rows_per_page)}</Label>
          <Select
            items={SIZE_ITEMS}
            value={pageSize}
            onValueChange={(size) => {
              if (size !== null) table.setPageSize(size as PageSize);
            }}
          >
            <SelectTrigger id={sizeId} size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums">
          {t(($) => $['data-table'].page, { page: pageIndex + 1, pages })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t(($) => $['data-table'].first_page)}
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.firstPage()}
          >
            <ChevronsLeftIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t(($) => $['data-table'].previous_page)}
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t(($) => $['data-table'].next_page)}
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t(($) => $['data-table'].last_page)}
            disabled={!table.getCanNextPage()}
            onClick={() => table.lastPage()}
          >
            <ChevronsRightIcon aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
