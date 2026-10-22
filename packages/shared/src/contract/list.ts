import * as z from 'zod';
import { type ValueOf, values } from '../values/define.ts';
import { SortOrder } from '../values/list.ts';
import { ZodIssueCode } from '../values/validation.ts';

// The list contract of data tables (ADR-0015): one query shape for the API and the URL, and one
// page shape for the response. Each list declares its sort keys and facets as value sets.

/** Rows per page a data table offers. Numbers, so not a value set. */
export const pageSizes = [10, 25, 50, 100] as const;
export type PageSize = (typeof pageSizes)[number];

const DEFAULT_PAGE_SIZE: PageSize = 25;
const MAX_PAGE = 10_000;
const MAX_Q = 100;

export type ValueSet = Readonly<Record<string, string>>;
export type FacetSets = Readonly<Record<string, ValueSet>>;
/**
 * Extra single-valued parameters outside the facets, for example a view or a reference id. Each
 * is a zod schema of a string input with a `.default()` or `.optional()`; its default stays out
 * of the query and the URL like every other default.
 */
export type ParamSchemas = Readonly<Record<string, z.ZodType<unknown, string | undefined>>>;

export interface ListSpec<
  S extends ValueSet,
  F extends FacetSets,
  P extends ParamSchemas = Record<never, never>,
> {
  /** The sortable columns, for example `TenantSortKey`. */
  readonly sort: S;
  readonly defaultSort: ValueOf<S>;
  readonly defaultOrder: SortOrder;
  /** Facet name → its value set, for example `{ package: PackageId }`. */
  readonly facets: F;
  readonly params?: P;
}

/** The parsed list state. `q` `''` is no search; a facet `[]` is no filter. */
export type ListState<
  S extends ValueSet,
  F extends FacetSets,
  P extends ParamSchemas = Record<never, never>,
> = {
  q: string;
  sort: ValueOf<S>;
  order: SortOrder;
  page: number;
  pageSize: PageSize;
} & { [K in keyof F]: ValueOf<F[K]>[] } & { [K in keyof P]: z.output<P[K]> };

/** The API query: every value a string, facets comma-separated, defaults left out. */
export type ListQuery<
  S extends ValueSet,
  F extends FacetSets,
  P extends ParamSchemas = Record<never, never>,
> = {
  q?: string;
  sort?: ValueOf<S>;
  order?: SortOrder;
  page?: string;
  pageSize?: string;
} & { [K in keyof F]?: string } & { [K in keyof P]?: string };

/** The URL search: the API query with numbers, so the router writes `page=2`, not `page="2"`. */
export type ListSearch<
  S extends ValueSet,
  F extends FacetSets,
  P extends ParamSchemas = Record<never, never>,
> = Omit<ListQuery<S, F, P>, 'page' | 'pageSize'> & { page?: number; pageSize?: number };

export interface ListPage<T> {
  items: T[];
  /** Rows that match the search and every facet. */
  total: number;
  page: number;
  pageSize: number;
}

export interface List<
  S extends ValueSet,
  F extends FacetSets,
  P extends ParamSchemas = Record<never, never>,
> {
  readonly spec: ListSpec<S, F, P>;
  readonly defaults: ListState<S, F, P>;
  /** API: strict, 422 with the zod path of each invalid or unknown parameter. */
  readonly query: z.ZodType<ListState<S, F, P>, ListQuery<S, F, P>>;
  /** Web: lenient, an invalid parameter falls back to its default and unknown facet values drop. */
  readonly search: z.ZodType<ListState<S, F, P>, ListSearch<S, F, P>>;
  toQuery(state: ListState<S, F, P>): ListQuery<S, F, P>;
  toSearch(state: ListState<S, F, P>): ListSearch<S, F, P>;
  /** Any URL search → its canonical form: valid values only, defaults left out. */
  canonical(search: unknown): ListSearch<S, F, P>;
}

/** The state type of a list: `ListStateOf<typeof TenantListQuery>`. */
export type ListStateOf<L extends { readonly defaults: unknown }> = L['defaults'];

const splitFacet = (raw: string) => [...new Set(raw.split(',').filter((v) => v !== ''))];

/** TanStack Router parses `q=123` into a number; the URL side reads it back as text. */
const asText = (v: unknown) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : v);

export function defineList<
  const S extends ValueSet,
  const F extends FacetSets,
  const P extends ParamSchemas = Record<never, never>,
>(spec: ListSpec<S, F, P>): List<S, F, P> {
  type State = ListState<S, F, P>;
  const facetNames = Object.keys(spec.facets) as (keyof F & string)[];
  const params: ParamSchemas = spec.params ?? {};
  const paramNames = Object.keys(params);
  /** What a param is without input: its default, or `undefined` for an optional one. */
  const paramDefaults = Object.fromEntries(
    paramNames.map((name) => [name, params[name]?.parse(undefined)]),
  );
  const pageSize = z.literal(pageSizes);
  const page = z.int().min(1).max(MAX_PAGE);

  const strictFacets = Object.fromEntries(
    facetNames.map((name) => [
      name,
      z
        .string()
        .transform(splitFacet)
        .pipe(z.array(z.enum(spec.facets[name] as ValueSet)))
        .default([])
        .describe(`Comma-separated: ${values(spec.facets[name] as ValueSet).join(', ')}`),
    ]),
  );
  const known = new Set(['q', 'sort', 'order', 'page', 'pageSize', ...facetNames, ...paramNames]);
  const query = z
    .looseObject({
      q: z.string().trim().max(MAX_Q).default('').describe('Case-insensitive substring'),
      sort: z.enum(spec.sort).default(spec.defaultSort),
      order: z.enum(SortOrder).default(spec.defaultOrder),
      page: z.coerce.number().pipe(page).default(1),
      pageSize: z.coerce.number().pipe(pageSize).default(DEFAULT_PAGE_SIZE),
      ...strictFacets,
      ...params,
    })
    // An unknown parameter fails at its own path, like an invalid one.
    .superRefine((parsed, ctx) => {
      for (const key of Object.keys(parsed)) {
        if (!known.has(key))
          ctx.addIssue({ code: ZodIssueCode.custom, path: [key], message: 'Unknown' });
      }
    });

  const lenientFacets = Object.fromEntries(
    facetNames.map((name) => {
      const set = spec.facets[name] as ValueSet;
      return [
        name,
        z
          .unknown()
          .transform((raw) => {
            const given = typeof raw === 'string' ? splitFacet(raw) : Array.isArray(raw) ? raw : [];
            return given.filter((v): v is string => values(set).includes(v));
          })
          .catch([]),
      ];
    }),
  );
  const lenientParams = Object.fromEntries(
    paramNames.map((name) => {
      const schema = params[name] as z.ZodType<unknown, string | undefined>;
      return [name, z.preprocess(asText, schema).catch(paramDefaults[name])];
    }),
  );
  const search = z.object({
    q: z.preprocess(asText, z.string().trim().max(MAX_Q)).catch(''),
    sort: z.enum(spec.sort).catch(spec.defaultSort),
    order: z.enum(SortOrder).catch(spec.defaultOrder),
    page: z.coerce.number().pipe(page).catch(1),
    pageSize: z.coerce.number().pipe(pageSize).catch(DEFAULT_PAGE_SIZE),
    ...lenientFacets,
    ...lenientParams,
  });

  const defaults = {
    q: '',
    sort: spec.defaultSort,
    order: spec.defaultOrder,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    ...Object.fromEntries(facetNames.map((name) => [name, []])),
    ...paramDefaults,
  } as State;

  function toSearch(state: State): ListSearch<S, F, P> {
    const out: Record<string, string | number> = {};
    if (state.q !== '') out.q = state.q;
    if (state.sort !== spec.defaultSort) out.sort = state.sort;
    if (state.order !== spec.defaultOrder) out.order = state.order;
    if (state.page !== 1) out.page = state.page;
    if (state.pageSize !== DEFAULT_PAGE_SIZE) out.pageSize = state.pageSize;
    for (const name of facetNames) {
      const selected = state[name] as readonly string[];
      if (selected.length > 0) out[name] = selected.join(',');
    }
    for (const name of paramNames) {
      const value = (state as Record<string, unknown>)[name];
      if (value !== undefined && value !== paramDefaults[name]) out[name] = String(value);
    }
    return out as ListSearch<S, F, P>;
  }

  function toQuery(state: State): ListQuery<S, F, P> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(toSearch(state))) out[key] = String(value);
    return out as ListQuery<S, F, P>;
  }

  // The schemas are built from the spec at runtime, so zod cannot infer the mapped facet keys.
  return {
    spec,
    defaults,
    query: query as unknown as List<S, F, P>['query'],
    search: search as unknown as List<S, F, P>['search'],
    toQuery,
    toSearch,
    canonical: (raw) => toSearch(search.parse(raw) as State),
  };
}
