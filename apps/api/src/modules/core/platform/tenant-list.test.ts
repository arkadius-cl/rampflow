import { randomBytes, randomUUID } from 'node:crypto';
import type { TenantList, TenantSummary } from '@rampflow/shared/modules/core/api.platform';
import {
  EuCountry,
  TaxIdStatus,
  TaxIdType,
  TenantCountryFacet,
  TenantFlag,
  TenantListView,
  TenantSortKey,
  TenantStatus,
} from '@rampflow/shared/modules/core/values';
import { OrgKind, PackageId, Role, SortOrder, StaffLocale } from '@rampflow/shared/values';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { WORLD_NOW, type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { TenantId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { appUser, invitation, membership, org, tenantSubscription } from '../schema.ts';
import { errorOf } from '../staff/fixtures.ts';

// PL-04 and PL-06's "Show matching tenants": GET /api/platform/tenants against Postgres. Every
// tenant is named with a prefix unique to this file run, so other files' tenants never match.

const app = createApp({ clock: testClock(WORLD_NOW) });

let w: World;
beforeAll(async () => {
  w = await world();
});

const platform = () => as(app, w.platformAdmin);
const minutes = (n: number) => new Date(WORLD_NOW.getTime() + n * 60_000);
const days = (n: number) => minutes(n * 24 * 60);
const uniquePrefix = () => `PL04 ${randomUUID().slice(0, 8)}`;
/** Digits unique to this run, for tax ids no other tenant has. */
const digits = (n: number) => [...randomBytes(n)].map((b) => String(b % 10)).join('');

interface SeedPerson {
  email: string;
  role?: Role;
  /** The membership's creation time. */
  joinedAt?: Date;
  lastSeenAt?: Date | null;
}

interface SeedInvitation {
  email: string;
  role?: Role;
  createdAt?: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
}

interface SeedTenant {
  name: string;
  package?: PackageId;
  active?: boolean;
  suspended?: boolean;
  country?: EuCountry;
  taxId?: { type: TaxIdType; value: string; status: TaxIdStatus };
  possibleDuplicate?: boolean;
  /** Members; `role` defaults to `tenant_admin`. */
  people?: readonly SeedPerson[];
  invitations?: readonly SeedInvitation[];
}

/**
 * Tenants created one minute apart in list order; `active` ones are activated at creation, the
 * others are onboarding, and `suspended` ones are suspended a day later.
 */
async function seedTenants(rows: readonly SeedTenant[]): Promise<TenantId[]> {
  const o = ownerDb();
  const ids: TenantId[] = [];
  for (const [i, row] of rows.entries()) {
    const createdAt = minutes(i);
    const [created] = await o
      .insert(org)
      .values({
        kind: OrgKind.tenant,
        name: row.name,
        createdAt,
        activatedAt: row.active ? createdAt : null,
        suspendedAt: row.suspended ? days(1) : null,
        country: row.country ?? null,
        taxIdType: row.taxId?.type ?? null,
        taxIdValue: row.taxId?.value ?? null,
        taxIdStatus: row.taxId?.status ?? null,
        possibleDuplicate: row.possibleDuplicate ?? false,
      })
      .returning({ id: org.id });
    const tenantId = created?.id as string as TenantId;
    await o.insert(tenantSubscription).values({
      tenantId,
      package: row.package ?? PackageId.pro,
      updatedBy: w.platformAdmin.id,
    });
    for (const person of row.people ?? []) {
      const [user] = await o
        .insert(appUser)
        .values({
          email: person.email,
          name: person.email,
          locale: StaffLocale.en,
          lastSeenAt: person.lastSeenAt ?? null,
        })
        .returning({ id: appUser.id });
      await o.insert(membership).values({
        userId: user?.id as never,
        orgId: tenantId,
        orgKind: OrgKind.tenant,
        role: person.role ?? Role.tenant_admin,
        createdAt: person.joinedAt ?? createdAt,
      });
    }
    for (const inv of row.invitations ?? []) {
      await o.insert(invitation).values({
        orgId: tenantId,
        orgKind: OrgKind.tenant,
        email: inv.email,
        role: inv.role ?? Role.tenant_admin,
        tokenHash: randomBytes(32),
        expiresAt: days(7),
        createdAt: inv.createdAt ?? createdAt,
        acceptedAt: inv.acceptedAt ?? null,
        revokedAt: inv.revokedAt ?? null,
      });
    }
    ids.push(tenantId);
  }
  return ids;
}

async function listOf(query: Record<string, string>): Promise<TenantList> {
  const res = await platform().get(`/api/platform/tenants?${new URLSearchParams(query)}`);
  expect(res.status).toBe(200);
  return (await res.json()) as TenantList;
}

/** The view "All", unless the query names a view. */
const list = (query: Record<string, string>) => listOf({ view: TenantListView.all, ...query });

const namesOf = (page: TenantList) => page.items.map((t) => t.name);
const idsOf = (page: TenantList) => page.items.map((t) => t.id);

describe('PL-04 tenant list', () => {
  // `${search} …` tenants for search and facets; every name is unique to this file run.
  const search = uniquePrefix();
  const named = (rest: string) => `${search} ${rest}`;
  const paged = uniquePrefix();
  const twin = uniquePrefix();
  let pagedIds: TenantId[];
  let twinIds: TenantId[];

  beforeAll(async () => {
    await seedTenants([
      { name: named('Acme Logistics'), package: PackageId.start, active: true },
      { name: named('ACME Freight'), package: PackageId.start },
      { name: named('acme pro'), package: PackageId.pro, active: true },
      { name: named('Beta Freight'), package: PackageId.enterprise },
      { name: named('100% Cargo'), package: PackageId.start },
      { name: named('1000 Cargo'), package: PackageId.pro },
    ]);
    pagedIds = await seedTenants(
      Array.from({ length: 30 }, (_, i) => ({
        name: `${paged} ${String(i + 1).padStart(2, '0')}`,
        package: PackageId.start,
      })),
    );
    twinIds = await seedTenants(
      Array.from({ length: 12 }, () => ({ name: twin, package: PackageId.pro })),
    );
  });

  it('answers the first 25 tenants in name order without a query', async () => {
    const page = await list({});
    expect(page).toMatchObject({ page: 1, pageSize: 25 });
    expect(page.items).toHaveLength(Math.min(25, page.total));
    const first = await list({ q: paged });
    expect(first).toMatchObject({ total: 30, page: 1, pageSize: 25 });
    expect(first.items.map((t) => t.id)).toEqual(pagedIds.slice(0, 25));
    expect(first.items[0]).toMatchObject({
      name: `${paged} 01`,
      package: PackageId.start,
      createdAt: WORLD_NOW.toISOString(),
    });
    const second = await list({ q: paged, page: '2' });
    expect(second.items.map((t) => t.id)).toEqual(pagedIds.slice(25));
  });

  it('searches the name case-insensitively with literal wildcards', async () => {
    const acme = await list({ q: `${search.toUpperCase()} acme` });
    expect(acme.items.map((t) => t.name)).toEqual([
      named('ACME Freight'),
      named('Acme Logistics'),
      named('acme pro'),
    ]);
    const percent = await list({ q: `${search} 100%` });
    expect(percent.items.map((t) => t.name)).toEqual([named('100% Cargo')]);
  });

  it('filters by several packages and combines the filter with the search', async () => {
    const both = await list({ q: search, package: `${PackageId.start},${PackageId.pro}` });
    expect(both.total).toBe(5);
    expect(both.items.every((t) => t.package !== PackageId.enterprise)).toBe(true);
    const pro = await list({ q: `${search} acme`, package: PackageId.pro });
    expect(pro.items.map((t) => t.name)).toEqual([named('acme pro')]);
    expect(pro.total).toBe(1);
  });

  it('counts each package under the search, ignoring the package selection', async () => {
    const pro = await list({ q: `${search} acme`, package: PackageId.pro });
    expect(pro.facets.package).toEqual({
      [PackageId.start]: 2,
      [PackageId.pro]: 1,
      [PackageId.enterprise]: 0,
    });
  });

  it('filters by status: onboarding answers only tenants without an activation time', async () => {
    const onboarding = await list({ q: `${search} acme`, status: TenantStatus.onboarding });
    expect(onboarding.items.map((t) => [t.name, t.status])).toEqual([
      [named('ACME Freight'), TenantStatus.onboarding],
    ]);
    const active = await list({ q: `${search} acme`, status: TenantStatus.active });
    expect(active.items.map((t) => [t.name, t.status])).toEqual([
      [named('Acme Logistics'), TenantStatus.active],
      [named('acme pro'), TenantStatus.active],
    ]);
    const both = await list({
      q: `${search} acme`,
      status: `${TenantStatus.onboarding},${TenantStatus.active}`,
    });
    expect(both.total).toBe(3);
  });

  it('counts each status under the search and the package filter, ignoring the status selection', async () => {
    const page = await list({ q: `${search} acme`, status: TenantStatus.onboarding });
    expect(page.facets.status).toEqual({
      [TenantStatus.onboarding]: 1,
      [TenantStatus.active]: 2,
      [TenantStatus.suspended]: 0,
    });
    const start = await list({ q: `${search} acme`, package: PackageId.start });
    expect(start.facets.status).toEqual({
      [TenantStatus.onboarding]: 1,
      [TenantStatus.active]: 1,
      [TenantStatus.suspended]: 0,
    });
    expect(page.facets.package).toEqual({
      [PackageId.start]: 1,
      [PackageId.pro]: 0,
      [PackageId.enterprise]: 0,
    });
  });

  it('sorts by creation, newest first', async () => {
    const page = await list({
      q: search,
      sort: TenantSortKey.createdAt,
      order: SortOrder.desc,
    });
    const created = page.items.map((t) => t.createdAt);
    expect(created).toHaveLength(6);
    expect(created).toEqual([...created].sort().reverse());
    expect(page.items[0]?.name).toBe(named('1000 Cargo'));
  });

  it('pages tenants with equal names without repeating or skipping one', async () => {
    const one = await list({ q: twin, pageSize: '10' });
    const two = await list({ q: twin, pageSize: '10', page: '2' });
    expect(one.items).toHaveLength(10);
    expect(two.items).toHaveLength(2);
    const seen = [...one.items, ...two.items].map((t) => t.id);
    expect(new Set(seen).size).toBe(12);
    expect(seen).toEqual([...twinIds].sort());
  });

  it('answers a page past the end with no items and the total', async () => {
    expect(await list({ q: twin, page: '5', pageSize: '10' })).toMatchObject({
      items: [],
      total: 12,
      page: 5,
      pageSize: 10,
    });
  });

  it.each([
    ['pageSize=7', ['pageSize']],
    ['sort=usage', ['sort']],
    ['package=gold', ['package', 0]],
    ['status=closed', ['status', 0]],
    ['tab=all', ['tab']],
    ['status=paused', ['status', 0]],
    ['view=urgent', ['view']],
  ])('answers 422 for %s at its path', async (query, path) => {
    const res = await platform().get(`/api/platform/tenants?${query}`);
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.issues).toEqual([expect.objectContaining({ path })]);
  });

  it('is not reachable for a tenant admin, whatever the query', async () => {
    const res = await as(app, w.A.users.tenant_admin).get('/api/platform/tenants?q=Tenant');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(search);
  });
});

describe('PL-04 status, country and flags', () => {
  const prefix = uniquePrefix();
  const named = (rest: string) => `${prefix} ${rest}`;
  const unverified = { type: TaxIdType.pl_nip, value: digits(10), status: TaxIdStatus.unverified };

  beforeAll(async () => {
    await seedTenants([
      { name: named('a onboarding'), package: PackageId.start },
      { name: named('b active'), active: true, country: EuCountry.AT },
      { name: named('c suspended'), active: true, suspended: true, country: EuCountry.DE },
      {
        name: named('d suspended in onboarding'),
        suspended: true,
        country: EuCountry.PL,
        package: PackageId.enterprise,
      },
      {
        name: named('e duplicate'),
        active: true,
        country: EuCountry.AT,
        package: PackageId.start,
        possibleDuplicate: true,
      },
      { name: named('f unverified'), active: true, taxId: unverified },
    ]);
  });

  it('reads a suspended tenant as suspended, with or without an activation time', async () => {
    const page = await list({ q: prefix, status: TenantStatus.suspended });
    expect(page.items.map((t) => [t.name, t.status])).toEqual([
      [named('c suspended'), TenantStatus.suspended],
      [named('d suspended in onboarding'), TenantStatus.suspended],
    ]);
    const onboarding = await list({ q: prefix, status: TenantStatus.onboarding });
    expect(namesOf(onboarding)).toEqual([named('a onboarding')]);
  });

  it('combines two statuses with OR', async () => {
    const page = await list({
      q: prefix,
      status: `${TenantStatus.onboarding},${TenantStatus.suspended}`,
    });
    expect(namesOf(page)).toEqual([
      named('a onboarding'),
      named('c suspended'),
      named('d suspended in onboarding'),
    ]);
  });

  it('filters tenants without a country by country=none, and combines facets', async () => {
    expect(namesOf(await list({ q: prefix, country: TenantCountryFacet.none }))).toEqual([
      named('a onboarding'),
      named('f unverified'),
    ]);
    expect(
      namesOf(await list({ q: prefix, package: PackageId.pro, country: TenantCountryFacet.AT })),
    ).toEqual([named('b active')]);
    expect(
      namesOf(
        await list({ q: prefix, country: `${TenantCountryFacet.none},${TenantCountryFacet.PL}` }),
      ),
    ).toEqual([named('a onboarding'), named('d suspended in onboarding'), named('f unverified')]);
  });

  it('combines both flags with OR', async () => {
    const page = await list({
      q: prefix,
      flag: `${TenantFlag.possible_duplicate},${TenantFlag.tax_id_unverified}`,
    });
    expect(namesOf(page)).toEqual([named('e duplicate'), named('f unverified')]);
    expect(page.items.map((t) => [t.possibleDuplicate, t.taxId])).toEqual([
      [true, null],
      [false, unverified],
    ]);
  });

  it('counts each facet value under the other facets, ignoring its own selection', async () => {
    const page = await list({ q: prefix, country: TenantCountryFacet.AT });
    expect(page.facets.country).toMatchObject({
      [TenantCountryFacet.AT]: 2,
      [TenantCountryFacet.DE]: 1,
      [TenantCountryFacet.PL]: 1,
      [TenantCountryFacet.none]: 2,
      [TenantCountryFacet.FR]: 0,
    });
    expect(page.facets.flag).toEqual({
      [TenantFlag.possible_duplicate]: 1,
      [TenantFlag.tax_id_unverified]: 0,
    });
    expect(page.facets.status).toEqual({
      [TenantStatus.onboarding]: 0,
      [TenantStatus.active]: 2,
      [TenantStatus.suspended]: 0,
    });
    const flagged = await list({ q: prefix, flag: TenantFlag.possible_duplicate });
    expect(flagged.facets.flag).toEqual({
      [TenantFlag.possible_duplicate]: 1,
      [TenantFlag.tax_id_unverified]: 1,
    });
  });

  it('sorts status and package in the order of their value sets', async () => {
    const byStatus = await list({ q: prefix, sort: TenantSortKey.status });
    expect(byStatus.items.map((t) => t.status)).toEqual([
      TenantStatus.onboarding,
      TenantStatus.active,
      TenantStatus.active,
      TenantStatus.active,
      TenantStatus.suspended,
      TenantStatus.suspended,
    ]);
    const byPackage = await list({
      q: prefix,
      sort: TenantSortKey.package,
      order: SortOrder.desc,
    });
    expect(byPackage.items.map((t) => t.package)).toEqual([
      PackageId.enterprise,
      PackageId.pro,
      PackageId.pro,
      PackageId.pro,
      PackageId.start,
      PackageId.start,
    ]);
  });

  it('sorts tenants without a country last in both directions', async () => {
    const asc = await list({ q: prefix, sort: TenantSortKey.country });
    expect(asc.items.map((t) => t.country)).toEqual([
      EuCountry.AT,
      EuCountry.AT,
      EuCountry.DE,
      EuCountry.PL,
      null,
      null,
    ]);
    const desc = await list({ q: prefix, sort: TenantSortKey.country, order: SortOrder.desc });
    expect(desc.items.map((t) => t.country)).toEqual([
      EuCountry.PL,
      EuCountry.DE,
      EuCountry.AT,
      EuCountry.AT,
      null,
      null,
    ]);
  });
});

describe('PL-04 search by tax id and admin email', () => {
  const prefix = uniquePrefix();
  const id = randomUUID().slice(0, 8);
  const vat = `DE${digits(9)}`;
  const spaced = `de ${vat.slice(2, 5)} ${vat.slice(5, 8)} ${vat.slice(8)}`;
  const first = `first-${id}@acme.example`;
  const second = `second-${id}@acme.example`;
  const invited = `boss-${id}@new.example`;
  let ids: TenantId[];

  beforeAll(async () => {
    ids = await seedTenants([
      {
        name: `${prefix} vat`,
        active: true,
        taxId: { type: TaxIdType.eu_vat, value: vat, status: TaxIdStatus.verified },
      },
      {
        name: `${prefix} two admins`,
        active: true,
        people: [
          { email: second, joinedAt: days(60) },
          { email: first, joinedAt: days(1) },
          { email: `dispatcher-${id}@acme.example`, role: Role.dispatcher, joinedAt: days(0) },
        ],
      },
      { name: `${prefix} invited`, invitations: [{ email: invited }] },
      { name: `${prefix} nobody`, active: true },
    ]);
  });

  it('finds a tax id typed with spaces and in lower case', async () => {
    expect(idsOf(await list({ q: spaced }))).toEqual([ids[0]]);
  });

  it('finds a tenant by its second admin, while the column shows the first', async () => {
    const page = await list({ q: `second-${id}@acme` });
    expect(page.items.map((t) => [t.id, t.admin])).toEqual([
      [ids[1], { email: first, invited: false }],
    ]);
  });

  it('does not search the emails of members who are not admins', async () => {
    expect((await list({ q: `dispatcher-${id}` })).items).toEqual([]);
  });

  it('finds a tenant by an open admin invitation and marks the admin as invited', async () => {
    const page = await list({ q: invited });
    expect(page.items.map((t) => [t.id, t.admin])).toEqual([
      [ids[2], { email: invited, invited: true }],
    ]);
  });

  it('shows no admin for a tenant with neither an admin nor an invitation', async () => {
    const page = await list({ q: `${prefix} nobody` });
    expect(page.items.map((t) => t.admin)).toEqual([null]);
  });
});

describe('PL-04 admin column', () => {
  const prefix = uniquePrefix();
  const id = randomUUID().slice(0, 8);

  it('prefers a member over an invitation, and the newest open invitation over older ones', async () => {
    await seedTenants([
      {
        name: `${prefix} member and invitation`,
        people: [{ email: `member-${id}@a.example` }],
        invitations: [{ email: `invitee-${id}@a.example` }],
      },
      {
        name: `${prefix} invitations`,
        invitations: [
          { email: `old-${id}@b.example`, createdAt: days(1) },
          { email: `new-${id}@b.example`, createdAt: days(3) },
          { email: `revoked-${id}@b.example`, createdAt: days(4), revokedAt: days(5) },
          { email: `staff-${id}@b.example`, createdAt: days(6), role: Role.dispatcher },
        ],
      },
    ]);
    const page = await list({ q: prefix });
    expect(page.items.map((t) => t.admin)).toEqual([
      { email: `new-${id}@b.example`, invited: true },
      { email: `member-${id}@a.example`, invited: false },
    ]);
  });
});

describe('PL-04 last activity', () => {
  const prefix = uniquePrefix();
  const id = randomUUID().slice(0, 8);
  let ids: TenantId[];

  beforeAll(async () => {
    ids = await seedTenants([
      {
        name: `${prefix} today`,
        active: true,
        people: [
          { email: `admin-${id}@today.example`, lastSeenAt: days(-1) },
          { email: `gate-${id}@today.example`, role: Role.gate_operator, lastSeenAt: days(0) },
          { email: `never-${id}@today.example`, role: Role.dispatcher },
        ],
      },
      { name: `${prefix} never`, invitations: [{ email: `boss-${id}@never.example` }] },
      {
        name: `${prefix} dormant`,
        active: true,
        people: [{ email: `admin-${id}@dormant.example`, lastSeenAt: days(-40) }],
      },
    ]);
  });

  it('is the latest request of any member, and null when nobody signed in', async () => {
    const page = await list({ q: prefix });
    expect(page.items.map((t) => [t.id, t.lastActivityAt])).toEqual([
      [ids[2], days(-40).toISOString()],
      [ids[1], null],
      [ids[0], days(0).toISOString()],
    ]);
  });

  it('sorts tenants never active last in both directions', async () => {
    const asc = await list({ q: prefix, sort: TenantSortKey.lastActivityAt });
    expect(idsOf(asc)).toEqual([ids[2], ids[0], ids[1]]);
    const desc = await list({
      q: prefix,
      sort: TenantSortKey.lastActivityAt,
      order: SortOrder.desc,
    });
    expect(idsOf(desc)).toEqual([ids[0], ids[2], ids[1]]);
  });
});

describe('PL-04 views', () => {
  const prefix = uniquePrefix();
  const named = (rest: string) => `${prefix} ${rest}`;

  beforeAll(async () => {
    await seedTenants([
      { name: named('1 onboarding') },
      { name: named('2 suspended'), active: true, suspended: true },
      { name: named('3 duplicate'), active: true, possibleDuplicate: true },
      {
        name: named('4 unverified'),
        active: true,
        taxId: { type: TaxIdType.pl_nip, value: digits(10), status: TaxIdStatus.unverified },
      },
      {
        name: named('5 fine'),
        active: true,
        taxId: { type: TaxIdType.pl_nip, value: digits(10), status: TaxIdStatus.verified },
      },
    ]);
  });

  it('opens on "Needs attention" and counts both views', async () => {
    const page = await listOf({ q: prefix });
    expect(page.views).toEqual({ [TenantListView.attention]: 4, [TenantListView.all]: 5 });
    expect(page.total).toBe(4);
    expect(namesOf(page)).toEqual([
      named('1 onboarding'),
      named('2 suspended'),
      named('3 duplicate'),
      named('4 unverified'),
    ]);
  });

  it('lists every tenant in the view "All"', async () => {
    const page = await listOf({ q: prefix, view: TenantListView.all });
    expect(page.total).toBe(5);
    expect(namesOf(page)).toContain(named('5 fine'));
  });

  it('counts the views under the search and the facets, and the facets within the view', async () => {
    const fine = await listOf({ q: named('5 fine') });
    expect(fine.views).toEqual({ [TenantListView.attention]: 0, [TenantListView.all]: 1 });
    expect(fine.items).toEqual([]);
    const active = await listOf({ q: prefix, status: TenantStatus.active });
    expect(active.views).toEqual({ [TenantListView.attention]: 2, [TenantListView.all]: 3 });
    expect(active.facets.status).toEqual({
      [TenantStatus.onboarding]: 1,
      [TenantStatus.active]: 2,
      [TenantStatus.suspended]: 1,
    });
  });
});

describe('PL-06 matching tenants (duplicateOf)', () => {
  const prefix = uniquePrefix();
  const id = randomUUID().slice(0, 8);
  const vat = `DE${digits(9)}`;
  const nip = digits(10);
  const domain = `acme-logistik-${id}.de`;
  const taxId = (type: TaxIdType, value: string) => ({
    type,
    value,
    status: TaxIdStatus.pending,
  });
  const other = () => taxId(TaxIdType.pl_nip, digits(10));
  const rows = {
    vatFlagged: {
      name: `${prefix} vat flagged`,
      possibleDuplicate: true,
      taxId: taxId(TaxIdType.eu_vat, vat),
    },
    vatTwin: { name: `${prefix} vat twin`, active: true, taxId: taxId(TaxIdType.eu_vat, vat) },
    nipFlagged: {
      name: `${prefix} nip flagged`,
      possibleDuplicate: true,
      taxId: taxId(TaxIdType.pl_nip, nip),
    },
    nipAsVat: {
      name: `${prefix} nip as vat`,
      active: true,
      taxId: taxId(TaxIdType.eu_vat, `PL${nip}`),
    },
    domainFlagged: {
      name: `${prefix} domain flagged`,
      possibleDuplicate: true,
      taxId: other(),
      people: [{ email: `anna-${id}@${domain}` }],
    },
    domainTwin: {
      name: `${prefix} domain twin`,
      active: true,
      taxId: other(),
      people: [{ email: `ben-${id}@${domain}`, role: Role.dispatcher }],
    },
    gmailFlagged: {
      name: `${prefix} gmail flagged`,
      possibleDuplicate: true,
      taxId: other(),
      people: [{ email: `carla-${id}@gmail.com` }],
    },
    gmailOther: {
      name: `${prefix} gmail other`,
      active: true,
      taxId: other(),
      people: [{ email: `dan-${id}@gmail.com` }],
    },
    unrelated: { name: `${prefix} unrelated`, active: true, taxId: other() },
  } satisfies Record<string, SeedTenant>;
  let t: Record<keyof typeof rows, TenantId>;

  beforeAll(async () => {
    const ids = await seedTenants(Object.values(rows));
    t = Object.fromEntries(Object.keys(rows).map((key, i) => [key, ids[i]])) as typeof t;
  });

  const matching = async (tenantId: string) => idsOf(await list({ duplicateOf: tenantId })).sort();

  it('lists the tenant and every tenant with the same tax id', async () => {
    expect(await matching(t.vatFlagged)).toEqual([t.vatFlagged, t.vatTwin].sort());
  });

  it('matches a NIP against its PL VAT number', async () => {
    expect(await matching(t.nipFlagged)).toEqual([t.nipFlagged, t.nipAsVat].sort());
  });

  it("matches another tenant with a member at the admin's email domain", async () => {
    expect(await matching(t.domainFlagged)).toEqual([t.domainFlagged, t.domainTwin].sort());
  });

  it('ignores a shared free-mail domain', async () => {
    expect(await matching(t.gmailFlagged)).toEqual([t.gmailFlagged]);
  });

  it('combines with the other filters and counts the views within the matches', async () => {
    const page = await listOf({ duplicateOf: t.vatFlagged });
    expect(page.views).toEqual({ [TenantListView.attention]: 1, [TenantListView.all]: 2 });
    expect(idsOf(page)).toEqual([t.vatFlagged]);
  });

  it('answers an empty list for an id that is not a tenant', async () => {
    for (const unknown of [randomUUID(), w.A.carrierId]) {
      const page = await list({ duplicateOf: unknown });
      expect(page).toMatchObject({ items: [], total: 0 });
      expect(page.views).toEqual({ [TenantListView.attention]: 0, [TenantListView.all]: 0 });
    }
  });

  it('answers 422 for a duplicateOf that is not a uuid', async () => {
    const res = await platform().get('/api/platform/tenants?duplicateOf=acme');
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['duplicateOf'] }),
    ]);
  });
});

describe('PL-04 summary fields', () => {
  it('answers country, tax id, admin, last activity and the duplicate flag per row', async () => {
    const prefix = uniquePrefix();
    const id = randomUUID().slice(0, 8);
    const vat = `AT${digits(9)}`;
    await seedTenants([
      {
        name: `${prefix} row`,
        active: true,
        country: EuCountry.AT,
        possibleDuplicate: true,
        taxId: { type: TaxIdType.eu_vat, value: vat, status: TaxIdStatus.verified },
        people: [{ email: `admin-${id}@row.example`, lastSeenAt: days(-2) }],
      },
    ]);
    const [row] = (await list({ q: prefix })).items;
    expect(row).toMatchObject({
      status: TenantStatus.active,
      country: EuCountry.AT,
      taxId: { type: TaxIdType.eu_vat, value: vat, status: TaxIdStatus.verified },
      admin: { email: `admin-${id}@row.example`, invited: false },
      lastActivityAt: days(-2).toISOString(),
      possibleDuplicate: true,
    } satisfies Partial<TenantSummary>);
  });
});
