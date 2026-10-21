import { ResourceKind } from '@rampflow/shared/modules/booking/values';
import { OrgKind } from '@rampflow/shared/values';
import { type SQL, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { ACME, seed as seedCore } from './core.ts';
import { NORDHAFEN, SIGNUP_TENANTS, seed as seedSignups } from './signups.ts';
import { seed } from './sites.ts';

const run = async () => {
  for (const s of [seedCore, seedSignups, seed]) {
    await ownerDb().transaction((tx) => s({ db: tx, log: () => undefined }));
  }
};

const tenantOf = (name: string) =>
  sql`(select id from org where kind = ${OrgKind.tenant} and name = ${name})`;
const siteIdOf = (tenant: string, name: string) =>
  sql`(select id from site where tenant_id = ${tenantOf(tenant)} and name = ${name})`;
const siteOf = (tenant: string, name: string) => sql`site_id = ${siteIdOf(tenant, name)}`;

/** `[resource name, kind, dock codes]` of the site, by name. */
const layout = async (siteId: SQL) =>
  (
    await ownerDb().execute<{ name: string; kind: ResourceKind; codes: string[] }>(sql`
      select r.name, r.kind, array_agg(d.code order by d.code) as codes
      from bookable_resource r
      join resource_dock rd on rd.resource_id = r.id
      join dock d on d.id = rd.dock_id
      where r.site_id = ${siteId}
      group by r.name, r.kind order by r.name`)
  ).rows.map((r) => [r.name, r.kind, r.codes]);

/** Docks of the tenant in no resource, or in one without an active load type (ADR-0017). */
const unbookable = async (tenant: string) =>
  (
    await ownerDb().execute<{ code: string }>(sql`
      select d.code from dock d left join resource_dock rd on rd.dock_id = d.id
      where d.tenant_id = ${tenantOf(tenant)} and (rd.dock_id is null or not exists (
        select 1 from load_type_resource ltr join load_type lt on lt.id = ltr.load_type_id
        where ltr.resource_id = rd.resource_id and lt.active))`)
  ).rows.map((r) => r.code);

const tables = ['site', 'hall', 'dock', 'bookable_resource', 'resource_dock', 'opening_hours'];
const counts = async () =>
  Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await ownerCount(t)])));

describe('pnpm db:seed, sites', () => {
  it('converges on Hamburg DC and Bucharest with default pools split by hand and T09 apart', async () => {
    await run();
    const before = await counts();
    await run();
    expect(await counts()).toEqual(before);

    expect(
      await ownerCount(
        'site',
        sql`tenant_id = ${tenantOf(ACME)} and name in ('Hamburg DC', 'Bucharest')`,
      ),
    ).toBe(2);
    const hamburg = siteOf(ACME, 'Hamburg DC');
    expect(await layout(siteIdOf(ACME, 'Hamburg DC'))).toEqual([
      ['Halle 2 · Tiefkühl', ResourceKind.pool, ['T09']],
      ['T05', ResourceKind.single, ['T05']],
      ['T08', ResourceKind.single, ['T08']],
      ['Versand', ResourceKind.pool, ['T06', 'T07']],
      ['Wareneingang', ResourceKind.pool, ['T01', 'T02', 'T03', 'T04']],
    ]);
    expect(await layout(siteIdOf(ACME, 'Bucharest'))).toEqual([
      ['Ramps', ResourceKind.pool, ['R1', 'R2']],
    ]);
    expect(await ownerCount('opening_hours', hamburg)).toBe(6);
    expect(await ownerCount('opening_hours', siteOf(ACME, 'Bucharest'))).toBe(5);
    expect(await ownerCount('load_type', hamburg)).toBe(4);
    expect(await ownerCount('closure', sql`${hamburg} and source = 'holiday'`)).toBeGreaterThan(5);
    expect(await unbookable(ACME)).toEqual([]);
  });

  it('takes Nordhafen to a site and a hall without a dock, and leaves the other signups bare', async () => {
    await run();
    await run();
    const bremerhaven = siteOf(NORDHAFEN, 'Bremerhaven');
    expect(await ownerCount('site', sql`tenant_id = ${tenantOf(NORDHAFEN)}`)).toBe(1);
    expect(await ownerCount('hall', bremerhaven)).toBe(1);
    expect(await ownerCount('dock', sql`tenant_id = ${tenantOf(NORDHAFEN)}`)).toBe(0);
    expect(
      await ownerCount(
        'opening_hours',
        sql`${bremerhaven} and opens = '06:00' and closes = '14:00'`,
      ),
    ).toBe(5);
    expect(await ownerCount('org', sql`id = ${tenantOf(NORDHAFEN)} and activated_at is null`)).toBe(
      1,
    );
    for (const t of SIGNUP_TENANTS.filter((t) => t.name !== NORDHAFEN)) {
      expect(await ownerCount('site', sql`tenant_id = ${tenantOf(t.name)}`), t.name).toBe(0);
    }
  });
});
