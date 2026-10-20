import {
  BookingEventType,
  BookingStatus,
  DockHoldingStatus,
  OnSiteStatus,
} from '@rampflow/shared/modules/booking/values';
import { values } from '@rampflow/shared/values';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { testClock } from '../../src/kernel/clock.ts';
import { booking } from '../../src/modules/booking/schema.ts';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { WORLD_NOW } from '../../test/world.ts';
import { seed } from './booking.ts';
import { ACME, seed as seedCore } from './core.ts';
import { seed as seedSafety } from './safety.ts';

const demoSite = sql`site_id = (select s.id from site s join org o on o.id = s.tenant_id
                     where o.name = ${ACME} and s.name = 'Lager Hamburg')`;
const dockHolding = sql`status in (${sql.join(
  values(DockHoldingStatus).map((s) => sql`${s}`),
  sql`, `,
)})`;

describe('pnpm db:seed, booking', () => {
  it('converges with occupied docks on the same day and across local midnight', async () => {
    const clock = testClock(WORLD_NOW);
    for (const s of [seedCore, seedSafety]) {
      await ownerDb().transaction((tx) => s({ db: tx, log: () => undefined }));
    }
    const run = () => ownerDb().transaction((tx) => seed({ db: tx, log: () => undefined }, clock));
    await run();
    const events = await ownerCount('booking_event');
    await run();
    expect(await ownerCount('booking_event')).toBe(events);
    expect(await ownerCount('booking', demoSite)).toBe(12);
    expect(await ownerCount('booking', sql`${demoSite} and ${dockHolding}`)).toBe(3);
    expect(await ownerCount('booking', sql`${demoSite} and walk_in`)).toBe(1);
    expect(
      await ownerCount(
        'booking',
        sql`${demoSite} and walk_in and status = ${BookingStatus.checked_in}`,
      ),
    ).toBe(1);
    expect(
      await ownerCount(
        'booking',
        sql`${demoSite} and status = ${BookingStatus.confirmed} and starts_at <= ${clock.now()}`,
      ),
    ).toBe(0);
    expect(
      await ownerCount(
        'booking',
        sql`${demoSite} and checked_in_at is not null and not exists
          (select 1 from booking_acknowledgement l where l.booking_id = booking.id)`,
      ),
    ).toBe(0);

    const unfinished = await ownerDb()
      .select({ id: booking.id })
      .from(booking)
      .where(and(demoSite, inArray(booking.status, values(OnSiteStatus))));
    // A fresh day's request IDs must not collide with yesterday's unfinished demo visits.
    clock.set(new Date('2026-10-19T22:05:00Z')); // Tuesday 00:05 in Berlin.
    await run();
    expect(await ownerCount('booking', demoSite)).toBe(24);
    expect(await ownerCount('booking', sql`${demoSite} and ${dockHolding}`)).toBe(3);
    const nextEvents = await ownerCount('booking_event');
    await run();
    expect(await ownerCount('booking_event')).toBe(nextEvents);
    expect(await ownerCount('booking', demoSite)).toBe(24);
    for (const { id } of unfinished) {
      const [row] = await ownerDb().select().from(booking).where(eq(booking.id, id));
      expect(row?.status).toBe(BookingStatus.departed);
      expect(row?.departedAt).toEqual(clock.now());
      expect(
        await ownerCount(
          'booking_event',
          sql`booking_id = ${id} and type = ${BookingEventType.departed}`,
        ),
      ).toBe(1);
    }

    // Cover early/late hours, multi-day gaps, and both sides of Berlin's DST changes.
    for (const [i, at] of [
      '2026-10-21T21:55:00Z',
      '2026-10-24T22:05:00Z',
      '2026-10-26T22:55:00Z',
      '2027-03-27T23:05:00Z',
      '2027-03-29T21:55:00Z',
    ].entries()) {
      clock.set(new Date(at));
      await run();
      expect(await ownerCount('booking', demoSite)).toBe((i + 3) * 12);
      expect(await ownerCount('booking', sql`${demoSite} and ${dockHolding}`)).toBe(3);
      const eventCount = await ownerCount('booking_event');
      await run();
      expect(await ownerCount('booking_event')).toBe(eventCount);
      expect(await ownerCount('booking', demoSite)).toBe((i + 3) * 12);
    }
  });
});
