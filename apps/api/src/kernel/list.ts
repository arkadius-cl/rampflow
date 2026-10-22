import type { ListPage } from '@rampflow/shared/contract/list';
import { SortOrder } from '@rampflow/shared/values';
import { type AnyColumn, asc, desc, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';

// SQL fragments of a data-table list (ADR-0015). Each list service composes them with its own
// where, joins and post-processing; the count, facet and page queries stay in the service.

/** `q` as a case-insensitive substring of any column; `%`, `_` and `\` match themselves. */
export function contains(q: string, ...columns: SQLWrapper[]): SQL | undefined {
  const text = q.trim();
  if (text === '') return undefined;
  const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
  return or(...columns.map((column) => sql`${column} ilike ${pattern} escape '\\'`));
}

/**
 * The sort column in the requested direction, then `id` ascending, so pages never overlap. The
 * keys in `nullsLast` put rows without a value after all others in both directions (Postgres
 * puts nulls first on `desc` by default).
 */
export function orderBy<S extends string>(
  state: { sort: S; order: SortOrder },
  columns: Record<S, AnyColumn | SQL>,
  id: AnyColumn,
  options: { nullsLast?: readonly S[] } = {},
): SQL[] {
  const column = columns[state.sort];
  const directed = state.order === SortOrder.desc ? desc(column) : asc(column);
  const nullsLast = options.nullsLast?.includes(state.sort)
    ? sql`${directed} nulls last`
    : directed;
  return [nullsLast, asc(id)];
}

export function pageWindow(state: { page: number; pageSize: number }): {
  limit: number;
  offset: number;
} {
  return { limit: state.pageSize, offset: (state.page - 1) * state.pageSize };
}

/** Grouped counts per facet value, with 0 for the values no row has. */
export function facetCounts<V extends string>(
  members: readonly V[],
  rows: readonly { value: V; count: number }[],
): Record<V, number> {
  const counts = Object.fromEntries(members.map((m) => [m, 0])) as Record<V, number>;
  for (const row of rows) counts[row.value] = row.count;
  return counts;
}

export function pageOf<T>(
  state: { page: number; pageSize: number },
  total: number,
  items: T[],
): ListPage<T> {
  return { items, total, page: state.page, pageSize: state.pageSize };
}
