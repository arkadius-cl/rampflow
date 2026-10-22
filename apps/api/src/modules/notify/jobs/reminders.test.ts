import { BookingStatus, CommandName, CreatedParty } from '@rampflow/shared/modules/booking/values';
import { EmailTemplate } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { type World, type WorldSide, world } from '../../../../test/world.ts';
import { type BookingId, wrapJson } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { runJobTick } from '../../../kernel/jobs.ts';
import {
  asStaff,
  bookableSite,
  bookingRow,
  type SeedBooking,
  seedBooking,
  setSetting,
} from '../../booking/lifecycle/fixtures.ts';
import { transitionBooking } from '../../booking/lifecycle/transition.ts';
import { booking } from '../../booking/schema.ts';
import { entitlementOverride, org } from '../../core/schema.ts';
import { outboxMessage } from '../schema.ts';
import { job } from './reminders.ts';

// BK-07 through the job runner. Bookings carry an explicit created_at, so the window rule does
// not depend on the wall clock of the test run.

const HOUR = 3_600_000;
const START = new Date('2026-11-10T09:00:00Z');
const at = (start: Date, hours: number) => new Date(start.getTime() + hours * HOUR);
const clock = testClock(START);
const mailer = { send: async () => undefined };
const tick = async (now: Date) => {
  clock.set(now);
  expect((await runJobTick(job, { clock, mailer })).ran).toBe(true);
};

const reminderStarts = async (bookingId: string) =>
  (
    await ownerDb()
      .select({ payload: outboxMessage.payload })
      .from(outboxMessage)
      .where(eq(outboxMessage.template, 'booking.reminder'))
  )
    .map((r) => r.payload as { bookingId: string; startsAt: string })
    .filter((p) => p.bookingId === bookingId)
    .map((p) => p.startsAt);

async function seeded(side: WorldSide, o: SeedBooking & { createdAt: Date }) {
  const row = await seedBooking(side, {
    createdParty: CreatedParty.carrier,
    createdBy: side.users.carrier_user.id,
    ...o,
  });
  await ownerDb().update(booking).set({ createdAt: o.createdAt }).where(eq(booking.id, row.id));
  return row.id as BookingId;
}

let w: World;
beforeAll(async () => {
  w = await world();
  await bookableSite(w.A);
  await setSetting(w.A.tenantId, 'notify.reminder_hours_before', 24, w.A.users.tenant_admin.id);
});

describe('BK-07 reminder job', () => {
  it('sends one reminder at notify.reminder_hours_before the start', async () => {
    const id = await seeded(w.A, { startsAt: START, createdAt: at(START, -7 * 24) });
    await tick(at(START, -24.01));
    expect(await reminderStarts(id)).toEqual([]);
    await tick(at(START, -24));
    await tick(at(START, -23));
    expect(await reminderStarts(id)).toEqual([START.toISOString()]);
    const [mail] = await ownerDb()
      .select()
      .from(outboxMessage)
      .where(eq(outboxMessage.toEmail, w.A.users.carrier_user.email));
    expect(mail).toMatchObject({
      template: EmailTemplate.booking_reminder,
      tenantId: w.A.tenantId,
    });
  });

  it('sends none for a cancelled booking', async () => {
    const start = at(START, 2);
    const id = await seeded(w.A, {
      startsAt: start,
      createdAt: at(start, -7 * 24),
      status: BookingStatus.cancelled,
    });
    await tick(at(start, -12));
    expect(await reminderStarts(id)).toEqual([]);
  });

  it('sends none for a booking created inside the reminder window', async () => {
    const start = at(START, 3);
    const id = await seeded(w.A, { startsAt: start, createdAt: at(start, -2) });
    await tick(at(start, -1));
    expect(await reminderStarts(id)).toEqual([]);
  });

  it('sends none with notify.reminders off', async () => {
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: w.B.tenantId,
        key: 'notify.reminders',
        value: wrapJson(false),
        updatedBy: w.platformAdmin.id,
      });
    await bookableSite(w.B);
    const id = await seeded(w.B, { startsAt: START, createdAt: at(START, -7 * 24) });
    await tick(at(START, -12));
    expect(await reminderStarts(id)).toEqual([]);
  });

  it('sends none for a booking of a suspended tenant, and sends it once reactivated (PL-07)', async () => {
    const own = await world();
    await bookableSite(own.A);
    await setSetting(
      own.A.tenantId,
      'notify.reminder_hours_before',
      24,
      own.A.users.tenant_admin.id,
    );
    const start = at(START, 5);
    const id = await seeded(own.A, { startsAt: start, createdAt: at(start, -7 * 24) });
    const tenant = eq(org.id, own.A.tenantId);
    await ownerDb()
      .update(org)
      .set({ suspendedAt: at(start, -48) })
      .where(tenant);
    try {
      await tick(at(start, -12));
      expect(await reminderStarts(id)).toEqual([]);
    } finally {
      await ownerDb().update(org).set({ suspendedAt: null }).where(tenant);
    }
    await tick(at(start, -11));
    expect(await reminderStarts(id)).toEqual([start.toISOString()]);
  });

  it('sends a new reminder for the new start after a reschedule', async () => {
    const start = at(START, 4);
    const id = await seeded(w.A, { startsAt: start, createdAt: at(start, -7 * 24) });
    await tick(at(start, -20));
    const moved = at(start, 48);
    const { version } = await bookingRow(id);
    await asStaff(w.A, w.A.users.dispatcher, at(start, -19), (ctx) =>
      transitionBooking(ctx, id, {
        type: CommandName.reschedule,
        startsAt: moved.toISOString(),
        version,
      }),
    );
    await tick(at(start, -18));
    expect(await reminderStarts(id)).toEqual([start.toISOString()]);
    await tick(at(moved, -24));
    expect(await reminderStarts(id)).toEqual([start.toISOString(), moved.toISOString()]);
  });
});
