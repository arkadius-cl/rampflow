import { describe, expect, it } from 'vitest';
import { TenantListQuery } from '../modules/core/api.platform.ts';
import { TenantListView, TenantSortKey } from '../modules/core/values.ts';
import { SortOrder } from '../values/list.ts';
import { PackageId } from '../values/packages.ts';

const { query, search, defaults, toQuery, toSearch } = TenantListQuery;

/** The query object Hono's validator hands to the schema: one string per key. */
const params = (qs: string): Record<string, string> =>
  Object.fromEntries(
    qs
      .replace(/^\?/, '')
      .split('&')
      .map((pair) => pair.split('=').map(decodeURIComponent)),
  );

const FULL = '?q=%20acme%20&package=start,pro&sort=createdAt&order=desc&page=2&pageSize=10';

describe('list query (API)', () => {
  it('parses every parameter from strings', () => {
    expect(query.parse(params(FULL))).toEqual({
      q: 'acme',
      status: [],
      package: [PackageId.start, PackageId.pro],
      country: [],
      flag: [],
      view: TenantListView.attention,
      duplicateOf: undefined,
      sort: TenantSortKey.createdAt,
      order: SortOrder.desc,
      page: 2,
      pageSize: 10,
    });
  });

  it('fills the defaults for omitted parameters', () => {
    expect(query.parse({})).toEqual(defaults);
    expect(defaults).toEqual({
      q: '',
      status: [],
      package: [],
      country: [],
      flag: [],
      view: TenantListView.attention,
      duplicateOf: undefined,
      sort: TenantSortKey.name,
      order: SortOrder.asc,
      page: 1,
      pageSize: 25,
    });
  });

  it('reads the extra params, with their default left out of the query and the URL', () => {
    const id = '0190f3b2-7c1e-7a2b-9c3d-0123456789ab';
    const state = query.parse({ view: TenantListView.all, duplicateOf: id });
    expect(state.view).toBe(TenantListView.all);
    expect(state.duplicateOf).toBe(id);
    expect(toQuery(state)).toEqual({ view: TenantListView.all, duplicateOf: id });
    expect(toSearch(defaults)).toEqual({});
    expect(search.parse({ view: 'urgent', duplicateOf: 'nope' })).toMatchObject({
      view: TenantListView.attention,
      duplicateOf: undefined,
    });
    expect(TenantListQuery.canonical({ view: TenantListView.attention })).toEqual({});
  });

  it.each([
    ['pageSize=7', ['pageSize']],
    ['page=0', ['page']],
    ['page=10001', ['page']],
    ['page=1.5', ['page']],
    ['sort=usage', ['sort']],
    ['order=up', ['order']],
    ['package=gold', ['package', 0]],
    ['package=pro,gold', ['package', 1]],
    ['view=urgent', ['view']],
    ['duplicateOf=abc', ['duplicateOf']],
    [`q=${'x'.repeat(101)}`, ['q']],
    ['foo=1', ['foo']],
  ])('rejects %s at its path', (qs, path) => {
    const result = query.safeParse(params(qs));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toEqual([path]);
  });

  it('trims q before the length check', () => {
    expect(query.parse({ q: ` ${'x'.repeat(100)} ` }).q).toHaveLength(100);
  });
});

describe('list search (URL)', () => {
  it('turns invalid values into defaults', () => {
    const bad = params(
      `pageSize=7&page=0&sort=usage&order=up&package=gold&q=${'x'.repeat(101)}&foo=1`,
    );
    expect(search.parse(bad)).toEqual(defaults);
    expect(search.parse(params('page=10001')).page).toBe(1);
  });

  it('keeps the valid values of a facet', () => {
    expect(search.parse(params('package=gold,pro')).package).toEqual([PackageId.pro]);
  });

  it('reads the numbers and arrays the router parses', () => {
    expect(search.parse({ page: 2, pageSize: 50, q: 123 })).toMatchObject({
      page: 2,
      pageSize: 50,
      q: '123',
    });
    expect(search.parse({ package: [PackageId.pro, 'gold'] }).package).toEqual([PackageId.pro]);
  });

  it('reads the full URL like the API', () => {
    expect(search.parse(params(FULL))).toEqual(query.parse(params(FULL)));
  });
});

describe('toQuery, toSearch and canonical', () => {
  it('canonical keeps valid values and drops defaults and invalid ones', () => {
    expect(
      TenantListQuery.canonical(params('package=gold,pro&pageSize=7&page=1&order=asc')),
    ).toEqual({
      package: PackageId.pro,
    });
    expect(TenantListQuery.canonical({ package: [PackageId.pro], page: 2 })).toEqual({
      package: PackageId.pro,
      page: 2,
    });
  });

  it('leave the defaults out', () => {
    expect(toQuery(defaults)).toEqual({});
    expect(toSearch(defaults)).toEqual({});
  });

  it('round-trip through the schemas', () => {
    const state = query.parse(params(FULL));
    expect(toQuery(state)).toEqual({
      q: 'acme',
      package: `${PackageId.start},${PackageId.pro}`,
      sort: TenantSortKey.createdAt,
      order: SortOrder.desc,
      page: '2',
      pageSize: '10',
    });
    expect(query.parse(toQuery(state))).toEqual(state);
    expect(toSearch(state)).toMatchObject({ page: 2, pageSize: 10 });
    expect(search.parse(toSearch(state))).toEqual(state);
  });
});
