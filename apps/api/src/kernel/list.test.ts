import { randomUUID } from 'node:crypto';
import { TenantSortKey } from '@rampflow/shared/modules/core/values';
import { OrgKind, PackageId, SortOrder, values } from '@rampflow/shared/values';
import { and, asc, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../test/db.ts';
import { org } from '../modules/core/schema.ts';
import { contains, facetCounts, orderBy, pageOf, pageWindow } from './list.ts';

const prefix = `list-${randomUUID().slice(0, 8)} `;
const NAMES = ['100% Cargo', '1000 Cargo', 'abc', 'a_c', 'Acme', 'back\\slash', 'same', 'same'];
/** The other rows have no country. */
const COUNTRY: Record<string, string> = { abc: 'DE', Acme: 'AT' };

beforeAll(async () => {
  await ownerDb()
    .insert(org)
    .values(
      NAMES.map((name) => ({ kind: OrgKind.carrier, name: prefix + name, country: COUNTRY[name] })),
    );
});

afterAll(async () => {
  await ownerDb()
    .delete(org)
    .where(like(org.name, `${prefix}%`));
});

async function matches(q: string): Promise<string[]> {
  const rows = await ownerDb()
    .select({ name: org.name })
    .from(org)
    .where(and(like(org.name, `${prefix}%`), contains(q, org.name)))
    .orderBy(asc(org.name));
  return rows.map((r) => r.name.slice(prefix.length));
}

describe('contains', () => {
  it('treats % and _ and \\ as literal characters', async () => {
    expect(await matches('100%')).toEqual(['100% Cargo']);
    expect(await matches('a_c')).toEqual(['a_c']);
    expect(await matches('k\\s')).toEqual(['back\\slash']);
  });

  it('ignores letter case and surrounding blanks', async () => {
    expect(await matches(' ACME ')).toEqual(['Acme']);
  });

  it('is no condition for an empty search', () => {
    expect(contains('', org.name)).toBeUndefined();
    expect(contains('   ', org.name)).toBeUndefined();
  });
});

describe('orderBy', () => {
  it.each([SortOrder.asc, SortOrder.desc])('breaks ties by id ascending (%s)', async (order) => {
    const rows = await ownerDb()
      .select({ id: org.id })
      .from(org)
      .where(like(org.name, `${prefix}same`))
      .orderBy(...orderBy({ sort: TenantSortKey.name, order }, { name: org.name }, org.id));
    const ids = rows.map((r) => r.id as string);
    expect(ids).toHaveLength(2);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('orderBy nullsLast', () => {
  type Country = typeof TenantSortKey.country;
  const countries = async (order: SortOrder, nullsLast: readonly Country[]) => {
    const rows = await ownerDb()
      .select({ country: org.country })
      .from(org)
      .where(like(org.name, `${prefix}%`))
      .orderBy(
        ...orderBy<Country>(
          { sort: TenantSortKey.country, order },
          { country: org.country },
          org.id,
          {
            nullsLast,
          },
        ),
      );
    return rows.map((r) => r.country);
  };
  const empty = Array<null>(NAMES.length - 2).fill(null);

  it('puts rows without a value last in both directions', async () => {
    expect(await countries(SortOrder.asc, [TenantSortKey.country])).toEqual(['AT', 'DE', ...empty]);
    expect(await countries(SortOrder.desc, [TenantSortKey.country])).toEqual([
      'DE',
      'AT',
      ...empty,
    ]);
  });

  it('keeps the Postgres default for keys it does not list', async () => {
    expect(await countries(SortOrder.desc, [])).toEqual([...empty, 'DE', 'AT']);
  });
});

describe('paging', () => {
  it('turns page and page size into limit and offset', () => {
    expect(pageWindow({ page: 1, pageSize: 25 })).toEqual({ limit: 25, offset: 0 });
    expect(pageWindow({ page: 3, pageSize: 10 })).toEqual({ limit: 10, offset: 20 });
  });

  it('fills absent facet values with 0', () => {
    expect(facetCounts(values(PackageId), [{ value: PackageId.pro, count: 3 }])).toEqual({
      [PackageId.start]: 0,
      [PackageId.pro]: 3,
      [PackageId.enterprise]: 0,
    });
  });

  it('shapes the page', () => {
    expect(pageOf({ page: 2, pageSize: 10 }, 12, ['x'])).toEqual({
      items: ['x'],
      total: 12,
      page: 2,
      pageSize: 10,
    });
  });
});
