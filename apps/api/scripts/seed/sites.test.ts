import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { ACME, seed as seedCore } from './core.ts';
import { seed } from './sites.ts';

const run = async () => {
  await ownerDb().transaction((tx) => seedCore({ db: tx, log: () => undefined }));
  await ownerDb().transaction((tx) => seed({ db: tx, log: () => undefined }));
};

const acmeSite = (name: string) =>
  sql`site_id = (select s.id from site s join org o on o.id = s.tenant_id
                 where o.name = ${ACME} and s.name = ${name})`;

describe('pnpm db:seed, sites', () => {
  it('creates Hamburg DC and Bucharest once, with pools, single docks, hours and load types', async () => {
    await run();
    await run();
    // Only the sites this module owns: the booking seed adds Acme's "Lager Hamburg" when it ran first.
    expect(
      await ownerCount(
        'site',
        sql`tenant_id = (select id from org where name = ${ACME}) and name in ('Hamburg DC', 'Bucharest')`,
      ),
    ).toBe(2);
    const hamburg = acmeSite('Hamburg DC');
    expect(await ownerCount('dock', hamburg)).toBe(8);
    expect(await ownerCount('bookable_resource', sql`${hamburg} and kind = 'pool'`)).toBe(2);
    expect(await ownerCount('bookable_resource', sql`${hamburg} and kind = 'single'`)).toBe(2);
    expect(await ownerCount('resource_dock', hamburg)).toBe(8);
    expect(await ownerCount('opening_hours', hamburg)).toBe(6);
    expect(await ownerCount('load_type', hamburg)).toBe(4);
    // Inbound types on the inbound pool and both singles, the outbound type on Versand and both.
    expect(await ownerCount('load_type_resource', hamburg)).toBe(3 * 3 + 3);
    expect(await ownerCount('closure', sql`${hamburg} and source = 'holiday'`)).toBeGreaterThan(5);
  });
});
