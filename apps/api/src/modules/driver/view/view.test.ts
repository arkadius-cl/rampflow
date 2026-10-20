import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { SafetyStatus } from '@rampflow/shared/modules/safety/values';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { world } from '../../../../test/world.ts';
import type { BookingId } from '../../../db/ids.ts';
import { avis } from '../../avis/schema.ts';
import { booking } from '../../booking/schema.ts';
import { site } from '../../core/schema.ts';
import { driverHarness } from '../session/fixtures.ts';

describe('DR-01 and DR-03 the booking view', () => {
  it('shows tenant, site, address with map link, slot, code and status, and no driver data', async () => {
    const { open, request } = driverHarness();
    const w = await world();
    const own = w.A.bookings.own;
    await ownerDb()
      .update(avis)
      .set({ driverPhone: '+4915112345678' })
      .where(eq(avis.bookingId, own.id as BookingId));
    const [personal] = await ownerDb()
      .select({ name: avis.driverName, phone: avis.driverPhone, plate: avis.plate })
      .from(avis)
      .where(eq(avis.bookingId, own.id as BookingId));
    const [s] = await ownerDb().select().from(site).where(eq(site.id, w.A.sites[0].id));

    const { jar } = await open(own.driverToken);
    const res = await request('GET', '/api/driver/booking', { jar });
    expect(res.status).toBe(200);
    const text = await res.text();
    const view = JSON.parse(text) as DriverBookingView;
    expect(view).toMatchObject({
      asOf: '2026-11-02T07:00:00.000Z',
      channel: DriverChannel.link,
      site: { name: s?.name, timeZone: s?.timeZone },
      booking: {
        code: own.code,
        status: BookingStatus.confirmed,
        startsAt: '2026-11-02T08:00:00.000Z',
        endsAt: '2026-11-02T08:30:00.000Z',
      },
      dock: null,
      safety: { status: SafetyStatus.not_required, validUntil: null },
      privacyNoticeUrl: null,
      linkExpiresAt: '2026-11-09T08:00:00.000Z',
    });
    expect(view.site.addressLines[0]).toBe(s?.addressLine1);
    expect(view.site.mapUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    for (const value of [personal?.name, personal?.phone, personal?.plate]) {
      expect(value).toBeTruthy();
      expect(text).not.toContain(value as string);
    }
  });

  it('shows the dock and hall once the truck is called', async () => {
    const { open, request } = driverHarness();
    const w = await world();
    const own = w.A.bookings.own;
    const { jar } = await open(own.driverToken);
    await ownerDb()
      .update(booking)
      .set({
        status: BookingStatus.called,
        dockId: w.A.sites[0].dockIds[0],
        checkedInAt: new Date('2026-11-02T07:50:00Z'),
        calledAt: new Date('2026-11-02T08:05:00Z'),
      })
      .where(eq(booking.id, own.id as BookingId));
    const view = (await (
      await request('GET', '/api/driver/booking', { jar })
    ).json()) as DriverBookingView;
    expect(view.booking).toMatchObject({
      status: BookingStatus.called,
      checkedInAt: '2026-11-02T07:50:00.000Z',
      calledAt: '2026-11-02T08:05:00.000Z',
    });
    expect(view.dock).toEqual({ code: expect.any(String), hall: 'Hall 1' });
  });

  it('answers 401 without a cookie', async () => {
    const { request } = driverHarness();
    expect((await request('GET', '/api/driver/booking')).status).toBe(401);
  });
});
