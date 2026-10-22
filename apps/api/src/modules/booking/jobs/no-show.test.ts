import { randomUUID } from 'node:crypto';
import { AvisInput } from '@rampflow/shared/modules/avis/avis';
import {
  BookingEventType,
  BookingStatus,
  CreatedParty,
  CreateMode,
} from '@rampflow/shared/modules/booking/values';
import { ConflictReason, ErrorCode, SystemActorName } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { type World, world } from '../../../../test/world.ts';
import type { BookingId } from '../../../db/ids.ts';
import { wrapJson } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { runJobTick } from '../../../kernel/jobs.ts';
import { entitlementOverride, org } from '../../core/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { createBooking } from '../lifecycle/create.ts';
import {
  asStaff,
  avisInput,
  bookableSite,
  bookingRow,
  eventsOf,
  seedBooking,
  setSetting,
} from '../lifecycle/fixtures.ts';
import { job } from './no-show.ts';

// BK-08 through the job runner, as the scheduler runs it: every tenant, the injected clock.

const START = new Date('2026-11-03T08:00:00Z');
const minutes = (n: number) => new Date(START.getTime() + n * 60_000);
const clock = testClock(START);
const mailer = { send: async () => undefined };
const tick = async (at: Date) => {
  clock.set(at);
  const result = await runJobTick(job, { clock, mailer });
  expect(result.ran).toBe(true);
};

const noShowMails = (to: string) =>
  ownerDb()
    .select()
    .from(outboxMessage)
    .where(and(eq(outboxMessage.toEmail, to), eq(outboxMessage.template, 'booking.no-show')));

let w: World;
beforeAll(async () => {
  w = await world();
  await bookableSite(w.A);
  await bookableSite(w.B);
  await setSetting(w.A.tenantId, 'yard.no_show_after_minutes', 60, w.A.users.tenant_admin.id);
});

const staffBookAtStart = (now: Date) =>
  asStaff(w.A, w.A.users.dispatcher, now, (ctx) =>
    createBooking(ctx, {
      mode: CreateMode.staff,
      clientRequestId: randomUUID(),
      siteId: w.A.sites[0].id,
      loadTypeId: w.A.sites[0].loadTypeId,
      startsAt: START,
      carrier: { name: 'Spedition Freitext' },
      avis: AvisInput.parse(avisInput()),
    }),
  );

describe('BK-08 no-show job', () => {
  it('marks a booking without check-in at the deadline, frees its capacity and emails the carrier', async () => {
    const carrierUser = w.A.users.carrier_user;
    const late = await seedBooking(w.A, {
      startsAt: START,
      createdParty: CreatedParty.carrier,
      createdBy: carrierUser.id,
    });
    // The pool holds two trucks at a time: with both units booked, staff cannot add a third.
    await seedBooking(w.A, { startsAt: START });
    await expect(staffBookAtStart(minutes(1))).rejects.toMatchObject({
      code: ErrorCode.conflict,
      details: { reason: ConflictReason.capacity_full },
    });

    await tick(minutes(59));
    expect((await bookingRow(late.id as BookingId)).status).toBe('confirmed');
    expect(await noShowMails(carrierUser.email)).toHaveLength(0);

    await tick(minutes(60));
    expect(await bookingRow(late.id as BookingId)).toMatchObject({
      status: BookingStatus.no_show,
      noShowAt: minutes(60),
    });
    const events = await eventsOf(late.id as BookingId);
    expect(events.at(-1)).toMatchObject({
      type: BookingEventType.no_show,
      actorParty: 'system',
      actorJob: SystemActorName.no_show,
      actorUserId: null,
    });
    const [mail, ...more] = await noShowMails(carrierUser.email);
    expect(more).toHaveLength(0);
    expect(mail).toMatchObject({ tenantId: w.A.tenantId, payload: { code: late.code } });

    expect((await staffBookAtStart(minutes(61))).created).toBe(true);
  });

  it('changes nothing on a second run', async () => {
    const b = await seedBooking(w.A, {
      startsAt: minutes(120),
      createdParty: CreatedParty.carrier,
      createdBy: w.A.users.carrier_admin.id,
    });
    await tick(minutes(180));
    const marked = await bookingRow(b.id as BookingId);
    const events = await eventsOf(b.id as BookingId);
    await tick(minutes(200));
    expect(await bookingRow(b.id as BookingId)).toEqual(marked);
    expect(await eventsOf(b.id as BookingId)).toEqual(events);
    expect(await noShowMails(w.A.users.carrier_admin.email)).toHaveLength(1);
  });

  it('leaves the bookings of a tenant without the yard module alone', async () => {
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: w.B.tenantId,
        key: 'yard.checkin_qr',
        value: wrapJson(false),
        updatedBy: w.platformAdmin.id,
      });
    const b = await seedBooking(w.B, {
      startsAt: START,
      createdParty: CreatedParty.carrier,
      createdBy: w.B.users.carrier_user.id,
    });
    await tick(minutes(24 * 60));
    expect((await bookingRow(b.id as BookingId)).status).toBe('confirmed');
    expect(await noShowMails(w.B.users.carrier_user.email)).toHaveLength(0);
  });

  it('leaves the bookings of a suspended tenant confirmed, and marks them after reactivation (PL-07)', async () => {
    const own = await world();
    await bookableSite(own.A);
    await setSetting(own.A.tenantId, 'yard.no_show_after_minutes', 60, own.A.users.tenant_admin.id);
    const carrierUser = own.A.users.carrier_user;
    const b = await seedBooking(own.A, {
      startsAt: START,
      createdParty: CreatedParty.carrier,
      createdBy: carrierUser.id,
    });
    const tenant = eq(org.id, own.A.tenantId);
    await ownerDb().update(org).set({ suspendedAt: START }).where(tenant);
    try {
      await tick(minutes(120));
      expect((await bookingRow(b.id as BookingId)).status).toBe(BookingStatus.confirmed);
      expect(await noShowMails(carrierUser.email)).toHaveLength(0);
    } finally {
      await ownerDb().update(org).set({ suspendedAt: null }).where(tenant);
    }
    await tick(minutes(121));
    expect((await bookingRow(b.id as BookingId)).status).toBe(BookingStatus.no_show);
  });
});
