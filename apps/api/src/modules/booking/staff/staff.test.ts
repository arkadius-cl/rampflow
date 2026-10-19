import { randomUUID } from 'node:crypto';
import { AvisInput } from '@rampflow/shared/modules/avis/avis';
import type {
  BoardView,
  BookingPage,
  BookingView,
} from '@rampflow/shared/modules/booking/api.staff';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { app, createApp } from '../../../app.ts';
import { hashToken } from '../../../db/ids.ts';
import { systemClock, testClock } from '../../../kernel/clock.ts';
import { type Job, runJobTick } from '../../../kernel/jobs.ts';
import { smtpMailer } from '../../../kernel/mailer.ts';
import { deliverOutbox } from '../../../kernel/outbox.ts';
import { driverAccess } from '../../driver/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { type CapacitySite, capacitySite } from '../capacity/fixtures.ts';
import { createBooking } from '../lifecycle/create.ts';
import { asStaff, avisInput, bookingRow, seedBooking, setSetting } from '../lifecycle/fixtures.ts';
import { transitionBooking } from '../lifecycle/transition.ts';
import { loadType, loadTypeResource } from '../schema.resources.ts';

let w: World;
beforeAll(async () => {
  w = await world();
});

const MON_0800 = '2026-11-02T07:00:00.000Z';
const base = () => `/api/t/${w.A.tenantId}/bookings`;
const dispatcher = () => as(app, w.A.users.dispatcher);

const oneDockSite = (o: Partial<Parameters<typeof capacitySite>[1]> = {}) =>
  capacitySite(w.A.tenantId, { hours: [[1, '06:00', '14:00']], minutes: 60, ...o });

const createBody = (s: CapacitySite, o: Record<string, unknown> = {}) => ({
  clientRequestId: randomUUID(),
  siteId: s.siteId,
  loadTypeId: s.loadTypeId,
  startsAt: MON_0800,
  carrier: { id: w.A.carrierId },
  avis: avisInput(),
  ...o,
});

async function create(s: CapacitySite, o: Record<string, unknown> = {}) {
  const res = await dispatcher().post(base(), { body: createBody(s, o) });
  expect(res.status).toBe(201);
  return (await res.json()) as BookingView;
}

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

describe('reschedule and cancel (BK-03)', () => {
  it('re-checks capacity without counting the booking itself and moves the driver link expiry', async () => {
    const s = await oneDockSite();
    const b = await create(s);
    const res = await dispatcher().patch(`${base()}/${b.id}`, {
      body: { startsAt: '2026-11-02T07:30:00.000Z', version: b.version },
    });
    expect(res.status).toBe(200);
    const moved = (await res.json()) as BookingView;
    expect(moved).toMatchObject({ startsAt: '2026-11-02T07:30:00.000Z', version: 2 });
    expect(moved.driverLink.expiresAt).toBe('2026-11-09T07:30:00.000Z');
  });

  it('answers 409 with offers for a taken slot and stale_version for an old version', async () => {
    const s = await oneDockSite();
    const taken = await create(s);
    const b = await create(s, { startsAt: '2026-11-02T10:00:00.000Z' });
    const full = await dispatcher().patch(`${base()}/${b.id}`, {
      body: { startsAt: taken.startsAt, version: 1 },
    });
    expect(full.status).toBe(409);
    expect(await errorOf(full)).toMatchObject({
      code: 'conflict',
      details: { reason: 'capacity_full', offers: { date: '2026-11-02' } },
    });
    const stale = await dispatcher().patch(`${base()}/${b.id}`, {
      body: { startsAt: '2026-11-02T11:00:00.000Z', version: 7 },
    });
    expect(await errorOf(stale)).toMatchObject({
      details: { reason: 'stale_version', version: 1 },
    });
  });

  it('frees capacity at once on cancel and revokes the driver link', async () => {
    const s = await oneDockSite();
    const b = await create(s);
    expect((await dispatcher().post(base(), { body: createBody(s) })).status).toBe(409);
    const res = await dispatcher().post(`${base()}/${b.id}/cancel`, { body: {} });
    expect(((await res.json()) as BookingView).status).toBe('cancelled');
    expect((await dispatcher().post(base(), { body: createBody(s) })).status).toBe(201);
    expect(
      await ownerCount('driver_access', sql`booking_id = ${b.id} and revoked_at is not null`),
    ).toBe(1);
  });

  it('stamps cancelled_late after the cutoff and not before', async () => {
    const startsAt = new Date('2026-11-04T08:00:00Z');
    const early = await seedBooking(w.A, { startsAt });
    const late = await seedBooking(w.A, { startsAt });
    const cancelAt = (id: string, now: Date) =>
      asStaff(w.A, w.A.users.dispatcher, now, (ctx) =>
        transitionBooking(ctx, id, { type: 'cancel' }),
      );
    // Default cutoff: 120 minutes before the start, at 06:00Z.
    expect((await cancelAt(early.id, new Date('2026-11-04T05:59:00Z'))).booking.cancelledLate).toBe(
      false,
    );
    expect((await cancelAt(late.id, new Date('2026-11-04T06:00:00Z'))).booking.cancelledLate).toBe(
      true,
    );
  });
});

describe('the avis (AV-01, AV-02)', () => {
  it('stores plates uppercase without separators and phones as E.164', async () => {
    const s = await oneDockSite();
    const b = await create(s, {
      avis: avisInput({
        vehicle: { plate: 'po 12-345', plateCountry: 'PL' },
        driver: { name: 'Jan Kowalski', phone: '0048 601 234 567', locale: 'pl' },
      }),
    });
    expect(b.avis).toMatchObject({
      vehicle: { plate: 'PO12345', plateCountry: 'PL' },
      driver: { phone: '+48601234567' },
    });
  });

  it('answers 422 with the field path for UN123 and accepts UN1203 with class 3', async () => {
    const s = await oneDockSite({ docks: 2 });
    const goods = (unNumber: string) =>
      createBody(s, {
        avis: avisInput({
          dangerousGoods: { present: true, items: [{ unNumber, adrClass: '3' }] },
        }),
      });
    const bad = await dispatcher().post(base(), { body: goods('UN123') });
    expect(bad.status).toBe(422);
    expect((await errorOf(bad)).details?.issues).toEqual([
      expect.objectContaining({ path: ['avis', 'dangerousGoods', 'items', 0, 'unNumber'] }),
    ]);
    expect((await dispatcher().post(base(), { body: goods('UN1203') })).status).toBe(201);
  });

  it('enforces the avis settings and booking.require_plate with 422 field paths', async () => {
    const s = await oneDockSite();
    const by = w.platformAdmin.id;
    await setSetting(w.A.tenantId, 'booking.require_plate', true, by, s.siteId);
    await setSetting(w.A.tenantId, 'avis.require_gross_weight', true, by, s.siteId);
    await setSetting(w.A.tenantId, 'avis.require_driver_phone', true, by, s.siteId);
    await setSetting(
      w.A.tenantId,
      'avis.required_reference_types',
      ['delivery_note'],
      by,
      s.siteId,
    );
    const res = await dispatcher().post(base(), { body: createBody(s) });
    expect(res.status).toBe(422);
    const issues = (await errorOf(res)).details?.issues as { path: unknown }[] | undefined;
    expect(issues?.map((i) => i.path)).toEqual([
      ['avis', 'references'],
      ['avis', 'grossWeightKg'],
      ['avis', 'driver', 'phone'],
      ['avis', 'vehicle', 'plate'],
    ]);
    expect(await ownerCount('booking', sql`site_id = ${s.siteId}`)).toBe(0);
  });

  it('answers 409 duplicate_reference under avis.unique_references', async () => {
    const s = await oneDockSite({ docks: 2 });
    await setSetting(w.A.tenantId, 'avis.unique_references', true, w.platformAdmin.id, s.siteId);
    await create(s);
    const again = await dispatcher().post(base(), {
      body: createBody(s, {
        avis: avisInput({ references: [{ type: 'purchase_order', value: ' po-4711 ' }] }),
      }),
    });
    expect(await errorOf(again)).toMatchObject({ details: { reason: 'duplicate_reference' } });
  });

  it('refuses an edit whose new duration does not fit and keeps the avis; after check-in it succeeds', async () => {
    const s = await oneDockSite();
    const [tiered] = await ownerDb()
      .insert(loadType)
      .values({
        tenantId: s.tenantId,
        siteId: s.siteId,
        name: { de: 'Palettiert', en: 'Palletised' },
        direction: 'inbound',
        duration: {
          kind: 'tiers',
          tiers: [
            { upTo: 10, minutes: 30 },
            { upTo: null, minutes: 120 },
          ],
        },
      })
      .returning();
    if (!tiered) throw new Error('no load type');
    await ownerDb().insert(loadTypeResource).values({
      loadTypeId: tiered.id,
      resourceId: s.resourceId,
      siteId: s.siteId,
      tenantId: s.tenantId,
    });
    const b = await create(s, { loadTypeId: tiered.id });
    await create(s, { loadTypeId: tiered.id, startsAt: '2026-11-02T08:00:00.000Z' });
    const bigger = {
      avis: avisInput({ loadUnits: [{ type: 'eur_pallet', quantity: 20 }] }),
      version: 1,
    };
    const refused = await dispatcher().put(`${base()}/${b.id}/avis`, { body: bigger });
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toMatchObject({ details: { reason: 'capacity_full' } });
    const unchanged = (await (await dispatcher().get(`${base()}/${b.id}`)).json()) as BookingView;
    expect(unchanged).toMatchObject({
      loadUnits: 10,
      endsAt: '2026-11-02T07:30:00.000Z',
      version: 1,
    });
    expect(unchanged.avis?.loadUnits).toEqual([{ type: 'eur_pallet', quantity: 10 }]);

    await asStaff(w.A, w.A.users.tenant_admin, new Date(MON_0800), (ctx) =>
      transitionBooking(ctx, b.id, { type: 'check_in' }),
    );
    const accepted = await dispatcher().put(`${base()}/${b.id}/avis`, {
      body: { ...bigger, version: 2 },
    });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()) as BookingView).toMatchObject({
      status: 'checked_in',
      loadUnits: 20,
      endsAt: '2026-11-02T09:00:00.000Z',
    });
  });
});

describe('the plan board and the list view (BK-01)', () => {
  it('shows booked against capacity per slot and flags a forced booking over capacity', async () => {
    const s = await oneDockSite();
    const normal = await create(s);
    const forced = await create(s, { force: true, forceReason: 'Eilauftrag' });
    const res = await dispatcher().get(`${base()}/board?siteId=${s.siteId}&date=2026-11-02`);
    expect(res.status).toBe(200);
    const board = (await res.json()) as BoardView;
    expect(board).toMatchObject({ timeZone: 'Europe/Berlin', gridMinutes: 30 });
    const [column] = board.resources;
    const slot = (at: string) => column?.slots.find((x) => x.startsAt === at);
    expect(slot(MON_0800)).toMatchObject({ wallTime: '08:00', capacity: 1, booked: 2 });
    expect(slot('2026-11-02T04:30:00.000Z')).toMatchObject({ wallTime: '05:30', capacity: 0 });
    expect(column?.bookings.map((b) => [b.id, b.overCapacity])).toEqual([
      [normal.id, true],
      [forced.id, true],
    ]);
    const quiet = await create(s, { startsAt: '2026-11-02T10:00:00.000Z' });
    const after = (await (
      await dispatcher().get(`${base()}/board?siteId=${s.siteId}&date=2026-11-02`)
    ).json()) as BoardView;
    expect(after.resources[0]?.bookings.find((b) => b.id === quiet.id)?.overCapacity).toBe(false);
  });

  it('pages the list view in start order', async () => {
    const s = await oneDockSite({ docks: 2 });
    const first = await create(s);
    const second = await create(s, { startsAt: '2026-11-02T09:00:00.000Z' });
    const page1 = (await (
      await dispatcher().get(`${base()}?siteId=${s.siteId}&date=2026-11-02&limit=1`)
    ).json()) as BookingPage;
    expect(page1.items.map((b) => b.id)).toEqual([first.id]);
    const page2 = (await (
      await dispatcher().get(
        `${base()}?siteId=${s.siteId}&date=2026-11-02&limit=1&cursor=${page1.nextCursor}`,
      )
    ).json()) as BookingPage;
    expect(page2).toEqual({
      items: [expect.objectContaining({ id: second.id })],
      nextCursor: null,
    });
  });
});

describe('the driver link (CR-06, issuing half)', () => {
  it('derives the URL from the active row and regenerating revokes the old one', async () => {
    const s = await oneDockSite();
    const b = await create(s);
    const link = async () =>
      (await (await dispatcher().get(`${base()}/${b.id}/driver-link`)).json()) as { url: string };
    const { url } = await link();
    const token = url.split('#')[1] ?? '';
    expect(url).toMatch(/\/d#[\w-]{43}$/);
    const [row] = await ownerDb()
      .select()
      .from(driverAccess)
      .where(eq(driverAccess.tokenHash, hashToken(token)));
    expect(row).toMatchObject({ bookingId: b.id, channel: 'link', revokedAt: null });
    const regenerated = (await (
      await dispatcher().post(`${base()}/${b.id}/driver-link`)
    ).json()) as { url: string };
    expect(regenerated.url).not.toBe(url);
    expect((await link()).url).toBe(regenerated.url);
    const [old] = await ownerDb()
      .select()
      .from(driverAccess)
      .where(eq(driverAccess.id, row?.id as never));
    expect(old?.revokedAt).toBeInstanceOf(Date);
  });

  it('emails the link in the chosen locale without storing the token', async () => {
    const s = await oneDockSite();
    const b = await create(s);
    const to = `driver-${randomUUID()}@example.test`;
    const res = await dispatcher().post(`${base()}/${b.id}/driver-link/email`, {
      body: { email: to, locale: 'ro' },
    });
    expect(res.status).toBe(202);
    const [row] = await ownerDb().select().from(outboxMessage).where(eq(outboxMessage.toEmail, to));
    expect(row).toMatchObject({ template: 'driver.link', locale: 'ro' });
    const { url } = (await (await dispatcher().get(`${base()}/${b.id}/driver-link`)).json()) as {
      url: string;
    };
    expect(JSON.stringify(row?.payload)).not.toContain(url.split('#')[1]);
  });
});

const MAILPIT = `http://${process.env.SMTP_HOST ?? 'localhost'}:8025`;
const deliverAll: Job = {
  name: `booking-mail-${randomUUID()}`,
  everySeconds: null,
  run: (ctx) => deliverOutbox({ ...ctx, mailer: smtpMailer() }),
};

async function deliveredTo(to: string): Promise<string[]> {
  for (let tick = 0; tick < 20; tick++) {
    const [pending] = await ownerDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(outboxMessage)
      .where(and(eq(outboxMessage.toEmail, to), sql`${outboxMessage.sentAt} is null`));
    if (!pending?.n) break;
    await runJobTick(deliverAll, { clock: systemClock, mailer: smtpMailer() });
  }
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const body = (await res.json()) as { messages: { Subject: string }[] };
  return body.messages.map((m) => m.Subject).sort();
}

describe('booking emails to the booking contact', () => {
  it('emails every staff change of a linked carrier booking to its carrier admin (Mailpit)', async () => {
    const mail = await world();
    const s = await capacitySite(mail.A.tenantId, { hours: [[1, '06:00', '14:00']], minutes: 60 });
    const staff = as(
      createApp({ clock: testClock(new Date('2026-10-19T08:00:00Z')) }),
      mail.A.users.dispatcher,
    );
    const url = `/api/t/${mail.A.tenantId}/bookings`;
    const created = await staff.post(url, {
      body: {
        clientRequestId: randomUUID(),
        siteId: s.siteId,
        loadTypeId: s.loadTypeId,
        startsAt: MON_0800,
        carrier: { id: mail.A.carrierId },
        avis: avisInput(),
      },
    });
    const b = (await created.json()) as BookingView;
    await staff.patch(`${url}/${b.id}`, {
      body: { startsAt: '2026-11-02T08:00:00.000Z', version: 1 },
    });
    await staff.put(`${url}/${b.id}/avis`, {
      body: { avis: avisInput({ counterpartyName: 'Neuer Lieferant' }), version: 2 },
    });
    await staff.post(`${url}/${b.id}/cancel`, { body: { reason: 'Tor gesperrt' } });
    const code = b.code;
    expect(await deliveredTo(mail.A.users.carrier_admin.email)).toEqual(
      [
        `Booking ${code} confirmed: ${b.site.name}`,
        `Booking ${code} changed`,
        `Booking ${code} changed`,
        `Booking ${code} cancelled`,
      ].sort(),
    );
    expect(await deliveredTo(mail.A.users.carrier_user.email)).toEqual([]);
  });

  it('sends nothing when the transaction rolls back after the enqueue', async () => {
    const mail = await world();
    const s = await capacitySite(mail.A.tenantId, { hours: [[1, '06:00', '14:00']], minutes: 60 });
    let enqueued = 0;
    await expect(
      asStaff(mail.A, mail.A.users.dispatcher, new Date('2026-10-19T08:00:00Z'), async (ctx) => {
        await createBooking(ctx, {
          mode: 'staff',
          clientRequestId: randomUUID(),
          siteId: s.siteId,
          loadTypeId: s.loadTypeId,
          startsAt: new Date(MON_0800),
          carrier: { id: mail.A.carrierId },
          avis: AvisInput.parse(avisInput()),
        });
        enqueued = (
          await ctx.tx
            .select({ id: outboxMessage.id })
            .from(outboxMessage)
            .where(eq(outboxMessage.toEmail, mail.A.users.carrier_admin.email))
        ).length;
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');
    expect(enqueued).toBe(0);
    expect(await deliveredTo(mail.A.users.carrier_admin.email)).toEqual([]);
    expect(
      await ownerCount('outbox_message', sql`to_email = ${mail.A.users.carrier_admin.email}`),
    ).toBe(0);
  });

  it('sends a carrier booking change to the carrier user who created it', async () => {
    const mail = await world();
    const b = await seedBooking(mail.A, {
      startsAt: new Date('2026-11-04T08:00:00Z'),
      createdParty: 'carrier',
      createdBy: mail.A.users.carrier_user.id,
    });
    await asStaff(mail.A, mail.A.users.dispatcher, new Date('2026-10-19T08:00:00Z'), (ctx) =>
      transitionBooking(ctx, b.id, { type: 'cancel' }),
    );
    expect(await deliveredTo(mail.A.users.carrier_user.email)).toEqual([
      `Booking ${b.code} cancelled`,
    ]);
    expect(await deliveredTo(mail.A.users.carrier_admin.email)).toEqual([]);
    expect((await bookingRow(b.id)).status).toBe('cancelled');
  });
});
