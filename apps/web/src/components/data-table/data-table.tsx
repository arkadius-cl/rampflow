import type { FacetSets, ListPage, ParamSchemas, ValueSet } from '@rampflow/shared/contract/list';
import { isValueOf, SortOrder } from '@rampflow/shared/values';
import {
  type ColumnDef,
  type PaginationState,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  type Updater,
  useTable,
} from '@tanstack/react-table';
import { type ReactNode, useEffect, useEffectEvent, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar, type FacetConfigs, facetEntries } from './data-table-toolbar';
import type { ListControls } from './use-list-state';

// A server-side data table after the shadcn data-table guide on TanStack Table v9 (ADR-0015).
// The server searches, filters, sorts and pages; the table renders one page and the controls.

export const dataTableFeatures = tableFeatures({ rowSortingFeature, rowPaginationFeature });

type FacetCounts = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** The part of a `useQuery` result the table reads. */
export interface DataTableQuery<TData> {
  data: (ListPage<TData> & { facets?: FacetCounts }) | undefined;
  isError: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  refetch: () => unknown;
}

const NO_ROWS: never[] = [];
const PLACEHOLDER_ROWS = 5;

const apply = <T,>(updater: Updater<T>, current: T): T =>
  typeof updater === 'function' ? (updater as (old: T) => T)(current) : updater;

export function DataTable<
  TData extends RowData,
  S extends ValueSet,
  F extends FacetSets,
  P extends ParamSchemas = Record<never, never>,
>({
  controls,
  query,
  columns,
  facets,
  label,
  searchPlaceholder,
  getRowId,
  rowTestId,
  empty,
  noMatchTitle,
}: {
  controls: ListControls<S, F, P>;
  query: DataTableQuery<TData>;
  /** Column ids equal the list's sort keys where the column sorts. */
  columns: ColumnDef<typeof dataTableFeatures, TData>[];
  facets: FacetConfigs<F>;
  /** The table's accessible name. */
  label: string;
  searchPlaceholder: string;
  getRowId: (row: TData) => string;
  rowTestId?: (row: TData) => string;
  /** The list's "none yet" state with its primary action. */
  empty: ReactNode;
  noMatchTitle: string;
}) {
  const { t } = useTranslation();
  const { list, state } = controls;
  const sortable = useMemo(
    () =>
      columns.map((c) => {
        const id = c.id ?? ('accessorKey' in c ? String(c.accessorKey) : undefined);
        return { ...c, enableSorting: isValueOf(list.spec.sort, id) };
      }),
    [columns, list],
  );
  const sorting: SortingState = [{ id: state.sort, desc: state.order === SortOrder.desc }];
  const pagination: PaginationState = { pageIndex: state.page - 1, pageSize: state.pageSize };
  const table = useTable({
    features: dataTableFeatures,
    columns: sortable,
    data: query.data?.items ?? NO_ROWS,
    getRowId,
    rowCount: query.data?.total,
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: false,
    state: { sorting, pagination },
    onSortingChange: (updater) => {
      const [next] = apply(updater, sorting);
      if (next && isValueOf(list.spec.sort, next.id)) {
        controls.setSort(next.id, next.desc ? SortOrder.desc : SortOrder.asc);
      }
    },
    onPaginationChange: (updater) => {
      const next = apply(updater, pagination);
      if (next.pageSize !== state.pageSize)
        controls.setPageSize(next.pageSize as typeof state.pageSize);
      else controls.setPage(next.pageIndex + 1);
    },
  });

  const settled = query.isPlaceholderData ? undefined : query.data;
  const clamp = useEffectEvent((page: ListPage<unknown>) => controls.clampPage(page));
  useEffect(() => {
    if (settled) clamp(settled);
  }, [settled]);

  const columnCount = columns.length;
  const fullRow = (content: ReactNode) => (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={columnCount} className="p-0">
        {content}
      </TableCell>
    </TableRow>
  );

  const criteria = [
    ...(state.q === '' ? [] : [t(($) => $['data-table'].criteria_search, { q: state.q })]),
    ...facetEntries(facets).flatMap(([name, facet]) => {
      const selected = state[name] as readonly string[];
      if (selected.length === 0) return [];
      const names = facet.options.filter((o) => selected.includes(o.value)).map((o) => o.label);
      return [
        t(($) => $['data-table'].criteria_facet, { facet: facet.title, values: names.join(', ') }),
      ];
    }),
  ].join('; ');

  function body() {
    if (query.isError) {
      return fullRow(
        <Empty role="alert">
          <EmptyHeader>
            <EmptyTitle>{t(($) => $['data-table'].error)}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t(($) => $['data-table'].retry)}
            </Button>
          </EmptyContent>
        </Empty>,
      );
    }
    const { data } = query;
    if (!data || (data.items.length === 0 && data.total > 0)) {
      return Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
        <TableRow key={i} aria-hidden>
          {Array.from({ length: columnCount }, (_, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholder cells have no identity
            <TableCell key={j}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }
    if (data.items.length === 0) {
      if (!controls.filtered) return fullRow(empty);
      return fullRow(
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{noMatchTitle}</EmptyTitle>
            <EmptyDescription>{t(($) => $['data-table'].no_match, { criteria })}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={controls.clear}>
              {t(($) => $['data-table'].clear)}
            </Button>
          </EmptyContent>
        </Empty>,
      );
    }
    return table.getRowModel().rows.map((row) => (
      <TableRow key={row.id} data-testid={rowTestId?.(row.original)}>
        {row.getAllCells().map((cell) => (
          <TableCell key={cell.id}>
            <table.FlexRender cell={cell} />
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar
        controls={controls}
        facets={facets}
        facetCounts={query.data?.facets}
        searchPlaceholder={searchPlaceholder}
        fetching={query.isFetching}
      />
      <div className="rounded-lg border bg-background">
        <Table aria-label={label} aria-busy={query.isFetching}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getCanSort() && header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted === SortOrder.asc
                          ? 'ascending'
                          : sorted === SortOrder.desc
                            ? 'descending'
                            : undefined
                      }
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{body()}</TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} shown={query.data} />
    </div>
  );
}
