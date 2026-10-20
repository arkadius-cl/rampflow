import { randomUUID } from 'node:crypto';
import { LoadUnitType, ReferenceType } from '@rampflow/shared/modules/avis/values';
import type {
  PortalBookingPage,
  PortalBookingView,
  PortalOffers,
  PortalRebook,
  PortalSite,
} from '@rampflow/shared/modules/booking/api.portal';
import {
  BookingStatus,
  CarrierLinkStatus,
  CreatedParty,
} from '@rampflow/shared/modules/booking/values';
import { DriverLocale } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, type WorldSide, type WorldUser, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { type BookingId, hashToken } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { tenantCarrierLink } from '../../core/schema.ts';
import { driverAccess } from '../../driver/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { type CapacitySite, capacitySite, placeBooking } from '../capacity/fixtures.ts';
import { avisInput, seedBooking, setSetting } from '../lifecycle/fixtures.ts';
import { closure, loadType } from '../schema.resources.ts';
import { booking } from '../schema.ts';

// The carrier portal through HTTP (BK-04, BK-05, BK-06, CR-05, CR-06, AV-02), against real
// Postgres. Monday 2 November 2026 in Berlin is UTC+1.

let w: World;
beforeAll(async () => {
  w = await world();
});

const FRIDAY = new Date('2026-10-30T08:00:00Z');
const MONDAY = '2026-11-02';
/** A Berlin wall time on Monday as an ISO instant. */
const mon = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, 2, (h ?? 0) - 1, m ?? 0)).toISOString();
};

const appAt = (now: Date) => createApp({ clock: testClock(now) });
const carrierAs = (user: WorldUser, now = FRIDAY) => as(appAt(now), user);
const carrierUser = () => w.A.users.carrier_user;
const rivalUser = () => w.A.users.rival_user;

const at = (side: WorldSide, carrierId: string = side.carrierId) =>
  `/api/c/${carrierId}/at/${side.tenantId}`;
const mine = (carrierId: string = w.A.carrierId) => `/api/c/${carrierId}/bookings`;

const site = (o: Partial<Parameters<typeof capacitySite>[1]> = {}, side = w.A) =>
  capacitySite(side.tenantId, { hours: [[1, '06:00', '14:00']], minutes: 60, ...o });

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

async function offers(s: CapacitySite, query: Record<string, string> = {}, now = FRIDAY) {
  const params = new URLSearchParams({
    siteId: s.siteId,
    loadTypeId: s.loadTypeId,
    date: MONDAY,
    loadUnits: '10',
    ...query,
  });
  const res = await carrierAs(carrierUser(), now).get(`${at(w.A)}/availability?${params}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as PortalOffers;
  expect(body).not.toHaveProperty('resources');
  return body.starts.map((s) => s.wallTime);
}

function book(
  s: CapacitySite,
  startsAt: string,
  o: { user?: WorldUser; carrierId?: string; side?: WorldSide; now?: Date } = {},
) {
  const side = o.side ?? w.A;
  return carrierAs(o.user ?? carrierUser(), o.now).post(`${at(side, o.carrierId)}/bookings`, {
    body: {
      clientRequestId: randomUUID(),
      siteId: s.siteId,
      loadTypeId: s.loadTypeId,
      startsAt,
      avis: avisInput({
        references: [
          { type: ReferenceType.purchase_order, value: `PO-${randomUUID().slice(0, 6)}` },
        ],
        driver: { name: 'Jan Kowalski', phone: '+48 600 100 200', locale: DriverLocale.pl },
        vehicle: { plate: 'wgm-4521k' },
      }),
    },
  });
}

async function booked(s: CapacitySite, startsAt: string, o: Parameters<typeof book>[2] = {}) {
  const res = await book(s, startsAt, o);
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as PortalBookingView;
}

describe('offered times (BK-04)', () => {
  it('respect hours, closures, capacity and lead time', async () => {
    const s = await site({ hours: [[1, '06:00', '10:00']] });
    await placeBooking(s, new Date(mon('07:00')), 60);
    await ownerDb()
      .insert(closure)
      .values({
        tenantId: s.tenantId,
        siteId: s.siteId,
        kind: 'closed',
        source: 'manual',
        startsLocal: `${MONDAY}T08:00`,
        endsLocal: `${MONDAY}T09:00`,
      });
    // 05:30 Berlin plus the default 120 minutes lead: nothing before 07:30.
    expect(await offers(s, {}, new Date(mon('05:30')))).toEqual(['09:00']);
    expect(await offers(s)).toEqual(['06:00', '09:00']);
  });

  it('respect the slot grid, the horizon and the daily cap', async () => {
    const s = await site({ hours: [[1, '06:00', '10:00']], dailyCap: 1 });
    await setSetting(w.A.tenantId, 'booking.slot_grid_minutes', 60, w.platformAdmin.id, s.siteId);
    expect(await offers(s)).toEqual(['06:00', '07:00', '08:00', '09:00']);
    await setSetting(w.A.tenantId, 'booking.horizon_days', 2, w.platformAdmin.id, s.siteId);
    expect(await offers(s)).toEqual([]);
    expect(await offers(s, {}, new Date('2026-11-01T08:00:00Z'))).toHaveLength(4);
    await placeBooking(s, new Date(mon('06:00')), 60);
    expect(await offers(s, {}, new Date('2026-11-01T08:00:00Z'))).toEqual([]);
  });

  it('lists the sites with their rules and only carrier-bookable load types', async () => {
    const s = await site();
    await setSetting(
      w.A.tenantId,
      'booking.cancel_cutoff_minutes',
      240,
      w.platformAdmin.id,
      s.siteId,
    );
    const res = await carrierAs(carrierUser()).get(`${at(w.A)}/sites`);
    const sites = ((await res.json()) as { items: PortalSite[] }).items;
    expect(sites.find((x) => x.id === s.siteId)).toMatchObject({
      timeZone: 'Europe/Berlin',
      cutoffMinutes: 240,
      leadMinutes: 120,
      address: { line1: 'Am Hafen 1', city: 'Hamburg' },
    });
    const types = async () =>
      (
        (await (
          await carrierAs(carrierUser()).get(`${at(w.A)}/load-types?siteId=${s.siteId}`)
        ).json()) as { items: { id: string }[] }
      ).items.map((t) => t.id);
    expect(await types()).toEqual([s.loadTypeId]);
    await ownerDb()
      .update(loadType)
      .set({ carrierBookable: false })
      .where(eq(loadType.id, s.loadTypeId));
    expect(await types()).toEqual([]);
    const hidden = await carrierAs(carrierUser()).get(
      `${at(w.A)}/availability?siteId=${s.siteId}&loadTypeId=${s.loadTypeId}&date=${MONDAY}`,
    );
    expect(hidden.status).toBe(404);
  });
});

describe('booking a slot (BK-04)', () => {
  it('two carriers race for the last unit: one 201, one 409 with the refreshed starts', async () => {
    const s = await site();
    const [first, second] = await Promise.all([
      book(s, mon('09:00')),
      book(s, mon('09:00'), { user: rivalUser(), carrierId: w.A.rivalCarrierId }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const lost = first.status === 409 ? first : second;
    const error = await errorOf(lost);
    expect(error.details).toMatchObject({ reason: 'capacity_full', offers: { date: MONDAY } });
    const refreshed = error.details?.offers as PortalOffers;
    expect(refreshed).not.toHaveProperty('resources');
    expect(refreshed.starts.map((x) => x.wallTime)).not.toContain('09:00');
    expect(refreshed.starts.map((x) => x.wallTime)).toContain('10:00');
    const rows = await ownerDb()
      .select()
      .from(booking)
      .where(and(eq(booking.siteId, s.siteId), eq(booking.startsAt, new Date(mon('09:00')))));
    expect(rows).toHaveLength(1);
  });

  it('confirms with the code, the slot in site time and the site address', async () => {
    const s = await site();
    const b = await booked(s, mon('09:00'));
    expect(b).toMatchObject({
      status: 'confirmed',
      startsAt: mon('09:00'),
      timeZone: 'Europe/Berlin',
      site: { id: s.siteId, address: { line1: 'Am Hafen 1', postalCode: '20457' } },
      tenant: { id: w.A.tenantId },
      cutoffAt: mon('07:00'),
      linkActive: true,
      driverLink: { active: true },
      avis: { vehicle: { plate: 'WGM4521K' }, driver: { phone: '+48600100200' } },
    });
    expect(b.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    const [mail] = await ownerDb()
      .select()
      .from(outboxMessage)
      .where(
        and(
          eq(outboxMessage.toEmail, carrierUser().email),
          eq(outboxMessage.template, 'booking.confirmed'),
        ),
      );
    expect(mail).toBeDefined();
  });

  it('answers 403 link_inactive on create after the tenant deactivated the link, while cancel still works', async () => {
    const s = await site();
    const b = await booked(s, mon('11:00'));
    await setLink(w.A, w.A.carrierId, CarrierLinkStatus.deactivated);
    try {
      const create = await book(s, mon('12:00'));
      expect(create.status).toBe(403);
      expect(await errorOf(create)).toMatchObject({
        code: 'forbidden',
        details: { reason: 'link_inactive' },
      });
      const cancel = await carrierAs(carrierUser()).post(`${at(w.A)}/bookings/${b.id}/cancel`, {
        body: {},
      });
      expect(cancel.status).toBe(200);
      expect(((await cancel.json()) as PortalBookingView).status).toBe('cancelled');
      const read = await carrierAs(carrierUser()).get(`${mine()}/${b.id}`);
      expect(((await read.json()) as PortalBookingView).linkActive).toBe(false);
    } finally {
      await setLink(w.A, w.A.carrierId, CarrierLinkStatus.active);
    }
  });
});

async function setLink(side: WorldSide, carrierId: string, status: 'active' | 'deactivated') {
  await ownerDb()
    .update(tenantCarrierLink)
    .set({ status, deactivatedAt: status === CarrierLinkStatus.active ? null : new Date() })
    .where(
      and(
        eq(tenantCarrierLink.tenantId, side.tenantId),
        eq(tenantCarrierLink.carrierId, carrierId as never),
      ),
    );
}

describe('change and cancel (BK-05)', () => {
  it('before the cutoff: reschedule re-checks capacity, cancel frees it and revokes the driver link', async () => {
    const s = await site();
    const taken = await booked(s, mon('10:00'), {
      user: rivalUser(),
      carrierId: w.A.rivalCarrierId,
    });
    const b = await booked(s, mon('09:00'));
    const full = await carrierAs(carrierUser()).patch(`${at(w.A)}/bookings/${b.id}`, {
      body: { startsAt: taken.startsAt, version: b.version },
    });
    expect(full.status).toBe(409);
    expect((await errorOf(full)).details).toMatchObject({ reason: 'capacity_full' });

    const moved = await carrierAs(carrierUser()).patch(`${at(w.A)}/bookings/${b.id}`, {
      body: { startsAt: mon('11:00'), version: b.version },
    });
    expect(moved.status).toBe(200);
    expect((await moved.json()) as PortalBookingView).toMatchObject({ startsAt: mon('11:00') });

    const cancel = await carrierAs(carrierUser()).post(`${at(w.A)}/bookings/${b.id}/cancel`, {
      body: {},
    });
    expect(cancel.status).toBe(200);
    const links = await ownerDb()
      .select()
      .from(driverAccess)
      .where(eq(driverAccess.bookingId, b.id as BookingId));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.revokedAt !== null)).toBe(true);
    await booked(s, mon('11:00'), { user: rivalUser(), carrierId: w.A.rivalCarrierId });
  });

  it('after the cutoff: change, cancel and avis edits answer 409 cutoff_passed', async () => {
    const s = await site();
    const b = await booked(s, mon('09:00'));
    const late = carrierAs(carrierUser(), new Date(mon('07:00')));
    const patch = await late.patch(`${at(w.A)}/bookings/${b.id}`, {
      body: { startsAt: mon('11:00'), version: b.version },
    });
    const cancel = await late.post(`${at(w.A)}/bookings/${b.id}/cancel`, { body: {} });
    const avis = await late.put(`${at(w.A)}/bookings/${b.id}/avis`, {
      body: { avis: avisInput({ counterpartyName: 'Neu GmbH' }), version: b.version },
    });
    for (const res of [patch, cancel, avis]) {
      expect(res.status).toBe(409);
      expect((await errorOf(res)).details).toMatchObject({ reason: 'cutoff_passed' });
    }
    const [row] = await ownerDb()
      .select()
      .from(booking)
      .where(eq(booking.id, b.id as never));
    expect(row).toMatchObject({ status: 'confirmed', version: b.version });
  });

  it('an avis edit whose new duration does not fit answers 409 and keeps the old avis (AV-02)', async () => {
    const s = await site({ hours: [[1, '06:00', '10:00']] });
    const tiers = [
      { upTo: 10, minutes: 30 },
      { upTo: null, minutes: 120 },
    ];
    await ownerDb()
      .update(loadType)
      .set({ duration: { kind: 'tiers', tiers } })
      .where(eq(loadType.id, s.loadTypeId));
    const b = await booked(s, mon('09:00'));
    const res = await carrierAs(carrierUser()).put(`${at(w.A)}/bookings/${b.id}/avis`, {
      body: {
        avis: avisInput({ loadUnits: [{ type: LoadUnitType.eur_pallet, quantity: 33 }] }),
        version: b.version,
      },
    });
    expect(res.status).toBe(409);
    const after = (await (
      await carrierAs(carrierUser()).get(`${mine()}/${b.id}`)
    ).json()) as PortalBookingView;
    expect(after.avis?.loadUnits).toEqual(b.avis?.loadUnits);
  });
});

describe('bookings across tenants (CR-05)', () => {
  it('lists the bookings at two tenants with filters; another carrier booking is 404', async () => {
    // A second tenant links world A's carrier as well.
    await ownerDb()
      .insert(tenantCarrierLink)
      .values({
        tenantId: w.B.tenantId,
        carrierId: w.A.carrierId,
        status: 'active',
        source: 'invitation',
      })
      .onConflictDoNothing();
    const sA = await site();
    const sB = await site({}, w.B);
    const atA = await booked(sA, mon('09:00'));
    const atB = await booked(sB, mon('10:00'), { side: w.B, carrierId: w.A.carrierId });
    const list = async (q: Record<string, string>) => {
      const res = await carrierAs(carrierUser()).get(`${mine()}?${new URLSearchParams(q)}`);
      expect(res.status).toBe(200);
      return ((await res.json()) as PortalBookingPage).items.map((b) => b.id);
    };
    const both = await list({ from: MONDAY, to: MONDAY });
    expect(both).toEqual(expect.arrayContaining([atA.id, atB.id]));
    expect(await list({ from: MONDAY, to: MONDAY, tenantId: w.B.tenantId })).toEqual([atB.id]);
    expect(await list({ siteId: sA.siteId })).toEqual([atA.id]);
    expect(await list({ siteId: sA.siteId, status: 'cancelled' })).toEqual([]);
    expect(await list({ siteId: sA.siteId, from: '2026-11-03' })).toEqual([]);
    const page = (await (
      await carrierAs(carrierUser()).get(`${mine()}?from=${MONDAY}&to=${MONDAY}&limit=1`)
    ).json()) as PortalBookingPage;
    expect(page.nextCursor).not.toBeNull();

    const detail = (await (
      await carrierAs(carrierUser()).get(`${mine()}/${atB.id}`)
    ).json()) as PortalBookingView;
    expect(detail.tenant.id).toBe(w.B.tenantId);
    expect(detail.events.map((e) => e.type)).toEqual(['created']);
    expect(detail.events[0]).not.toHaveProperty('actor');

    const foreign = await carrierAs(carrierUser()).get(`${mine()}/${w.A.bookings.rival.id}`);
    expect(foreign.status).toBe(404);
    const rivalList = await carrierAs(rivalUser()).get(`${mine(w.A.rivalCarrierId)}`);
    const rivalIds = ((await rivalList.json()) as PortalBookingPage).items.map((b) => b.id);
    expect(rivalIds).not.toContain(atA.id);
  });
});

describe('upcoming and past tabs (CR-05)', () => {
  it('splits by lifecycle state: final is past, on site is upcoming, a pending booking by its day', async () => {
    const s = await site();
    const sun = (hhmm: string) => new Date(new Date(mon(hhmm)).getTime() - 86_400_000);
    const tue = (hhmm: string) => new Date(new Date(mon(hhmm)).getTime() + 86_400_000);
    const seeded = async (startsAt: Date, status: BookingStatus) =>
      (await seedBooking(w.A, { startsAt, status, site: s, createdParty: CreatedParty.carrier }))
        .id;
    const departedToday = await seeded(new Date(mon('07:00')), BookingStatus.departed);
    const doneToday = await seeded(new Date(mon('08:00')), BookingStatus.done);
    const laterToday = await seeded(new Date(mon('16:00')), BookingStatus.confirmed);
    const staleYesterday = await seeded(sun('10:00'), BookingStatus.confirmed);
    const stillOnSite = await seeded(sun('22:00'), BookingStatus.checked_in);
    const cancelledTomorrow = await seeded(tue('09:00'), BookingStatus.cancelled);
    const tomorrow = await seeded(tue('10:00'), BookingStatus.requested);
    const noon = new Date(mon('12:00'));
    const tab = async (when: string) => {
      const q = new URLSearchParams({ siteId: s.siteId, when });
      const res = await carrierAs(carrierUser(), noon).get(`${mine()}?${q}`);
      expect(res.status).toBe(200);
      return ((await res.json()) as PortalBookingPage).items.map((b) => b.id).sort();
    };
    expect(await tab('upcoming')).toEqual([stillOnSite, doneToday, laterToday, tomorrow].sort());
    expect(await tab('past')).toEqual([departedToday, staleYesterday, cancelledTomorrow].sort());
  });
});

describe('book again (BK-06)', () => {
  it('prefills site, load type and avis, leaving references and driver empty', async () => {
    const s = await site();
    const b = await booked(s, mon('12:00'));
    const res = await carrierAs(carrierUser()).get(`${mine()}/${b.id}/rebook`);
    expect(res.status).toBe(200);
    const prefill = (await res.json()) as PortalRebook;
    expect(prefill).toMatchObject({
      tenantId: w.A.tenantId,
      siteId: s.siteId,
      loadTypeId: s.loadTypeId,
      avis: {
        references: [],
        counterpartyName: 'Lieferant GmbH',
        loadUnits: [{ type: 'eur_pallet', quantity: 10 }],
        vehicle: { plate: 'WGM4521K' },
      },
    });
    expect(prefill.avis).not.toHaveProperty('driver');
  });
});

describe('the driver link (CR-06)', () => {
  it('reads the link, regenerates it and revokes the old one, and emails it in a chosen locale', async () => {
    const s = await site();
    const b = await booked(s, mon('13:00'));
    const link = async () =>
      (
        (await (await carrierAs(carrierUser()).get(`${mine()}/${b.id}/driver-link`)).json()) as {
          url: string;
        }
      ).url;
    const first = await link();
    expect(first).toMatch(/\/d#[\w-]{43}$/);
    const regenerated = await carrierAs(carrierUser()).post(
      `${at(w.A)}/bookings/${b.id}/driver-link`,
    );
    expect(regenerated.status).toBe(200);
    const second = ((await regenerated.json()) as { url: string }).url;
    expect(second).not.toBe(first);
    expect(await link()).toBe(second);
    const [old] = await ownerDb()
      .select()
      .from(driverAccess)
      .where(eq(driverAccess.tokenHash, hashToken(first.split('#')[1] ?? '')));
    expect(old?.revokedAt).toBeInstanceOf(Date);

    const to = `driver-${randomUUID().slice(0, 8)}@example.test`;
    const sent = await carrierAs(carrierUser()).post(
      `${at(w.A)}/bookings/${b.id}/driver-link/email`,
      { body: { email: to, locale: 'uk' } },
    );
    expect(sent.status).toBe(202);
    const [mail] = await ownerDb()
      .select()
      .from(outboxMessage)
      .where(eq(outboxMessage.toEmail, to));
    expect(mail).toMatchObject({ template: 'driver.link', locale: 'uk' });
  });
});
