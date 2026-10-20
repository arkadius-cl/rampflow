import type {
  FacetSets,
  List,
  ListPage,
  ListSearch,
  ListState,
  PageSize,
  ValueSet,
} from '@rampflow/shared/contract/list';
import type { SortOrder, ValueOf } from '@rampflow/shared/values';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

// The data table's state is the route's search params (ADR-0015). Facet, sort and page changes
// add a history entry; a typing run in the search field adds one and updates it afterwards.

const SEARCH_DELAY_MS = 300;

/** Writes the list's URL search; `replace` updates the current history entry. */
export type ListNavigate<S extends ValueSet, F extends FacetSets> = (
  search: ListSearch<S, F>,
  replace: boolean,
) => void;

export interface ListControls<S extends ValueSet, F extends FacetSets> {
  list: List<S, F>;
  state: ListState<S, F>;
  /** A search or a facet is set. */
  filtered: boolean;
  /** The search field's text, ahead of the URL while the user types. */
  draft: string;
  setDraft: (text: string) => void;
  /** Ends the typing run, so the next search adds its own history entry. */
  endTyping: () => void;
  setFacet: (name: keyof F & string, selected: readonly string[]) => void;
  setSort: (sort: ValueOf<S>, order: SortOrder) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: PageSize) => void;
  /** Drops the search and every facet; keeps sort and page size. */
  clear: () => void;
  /** Moves to the last page with rows when rows disappeared under the current page. */
  clampPage: (page: ListPage<unknown>) => void;
}

export function useListState<S extends ValueSet, F extends FacetSets>(
  list: List<S, F>,
  state: ListState<S, F>,
  navigate: ListNavigate<S, F>,
): ListControls<S, F> {
  const facetNames = Object.keys(list.spec.facets) as (keyof F & string)[];
  const [draft, setDraft] = useState(state.q);
  const committed = useRef(state.q);
  const typing = useRef(false);

  const go = useEffectEvent((next: ListState<S, F>, replace = false) => {
    if (!replace) typing.current = false;
    navigate(list.toSearch(next), replace);
  });

  // Back, forward and "Clear filters" change `q` from outside: show it and end the typing run.
  useEffect(() => {
    if (state.q === committed.current) return;
    committed.current = state.q;
    typing.current = false;
    setDraft(state.q);
  }, [state.q]);

  const commitSearch = useEffectEvent((q: string) => {
    const replace = typing.current;
    committed.current = q;
    go({ ...state, q, page: 1 }, replace);
    typing.current = true;
  });

  useEffect(() => {
    const q = draft.trim();
    if (q === committed.current) return;
    const timer = setTimeout(() => commitSearch(q), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const filtered =
    state.q !== '' || facetNames.some((name) => (state[name] as readonly string[]).length > 0);

  return {
    list,
    state,
    filtered,
    draft,
    setDraft,
    endTyping: () => {
      typing.current = false;
    },
    setFacet: (name, selected) => go({ ...state, [name]: [...selected], page: 1 }),
    setSort: (sort, order) => go({ ...state, sort, order, page: 1 }),
    setPage: (page) => go({ ...state, page }),
    setPageSize: (pageSize) => go({ ...state, pageSize, page: 1 }),
    clear: () => {
      committed.current = '';
      setDraft('');
      go({ ...list.defaults, sort: state.sort, order: state.order, pageSize: state.pageSize });
    },
    clampPage: ({ items, total }) => {
      if (items.length > 0 || total === 0 || state.page === 1) return;
      go({ ...state, page: Math.ceil(total / state.pageSize) }, true);
    },
  };
}

/**
 * The route search middleware that keeps a list's URL canonical: invalid values and defaults
 * leave it, facets stay comma-separated. TanStack Router types a middleware's result as the
 * validated search but stringifies whatever it returns, so the string form passes as that type.
 */
export function canonicalSearch<S extends ValueSet, F extends FacetSets>(list: List<S, F>) {
  return ({
    search,
    next,
  }: {
    search: ListState<S, F>;
    next: (search: ListState<S, F>) => ListState<S, F>;
  }) => list.canonical(next(search)) as unknown as ListState<S, F>;
}
