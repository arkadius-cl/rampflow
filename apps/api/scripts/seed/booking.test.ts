import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { seed } from './booking.ts';
import { ACME, seed as seedCore } from './core.ts';
import { seed as seedSafety } from './safety.ts';

const run = async () => {
  for (const s of [seedCore, seedSafety, seed]) {
    await ownerDb().transaction((tx) => s({ db: tx, log: () => undefined }));
  }
};

const demoDay = sql`site_id = (select s.id from site s join org o on o.id = s.tenant_id
                     where o.name = ${ACME} and s.name = 'Lager Hamburg')
                   and starts_at > now() - interval '5 hours'`;

describe('pnpm db:seed, booking', () => {
  it('leaves every truck it checks in, the walk-in included, on site with a linked briefing', async () => {
    await run();
    await run();
    expect(await ownerCount('booking', sql`${demoDay} and walk_in`)).toBe(1);
    expect(await ownerCount('booking', sql`${demoDay} and walk_in and status = 'checked_in'`)).toBe(
      1,
    );
    // A confirmed booking whose slot has begun is what the no-show job picks up next.
    expect(
      await ownerCount('booking', sql`${demoDay} and status = 'confirmed' and starts_at <= now()`),
    ).toBe(0);
    expect(
      await ownerCount(
        'booking',
        sql`${demoDay} and checked_in_at is not null and not exists
          (select 1 from booking_acknowledgement l where l.booking_id = booking.id)`,
      ),
    ).toBe(0);
  });
});
