import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import type { EraseResult, SubjectMatches } from '@rampflow/shared/modules/privacy/api';
import { PrivacyRequestKind } from '@rampflow/shared/modules/privacy/values';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { BookingId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { seedBooking } from '../../booking/lifecycle/fixtures.ts';
import { type BriefingFixture, seedBriefing } from '../../safety/authoring/fixtures.ts';
import { acknowledgementOf, avisOf, seedAcknowledgement, setAvis } from '../fixtures.ts';
import { privacyRequestLog } from '../schema.ts';

// TN-06 through the HTTP routes, as a tenant admin. The clock is the wall clock, so the
// world's sessions stay valid; every instant below is relative to it.

const NOW = new Date();
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const app = createApp({ clock: testClock(NOW) });

const JAN = 'Jan Kowalski';
let w: World;
let briefing: BriefingFixture;
let jans: BookingId;
let anna: BookingId;
let byPlateOnly: BookingId;
const acks: Record<'held' | 'expired' | 'linked' | 'other', string> = {
  held: '',
  expired: '',
  linked: '',
  other: '',
};

beforeAll(async () => {
  w = await world();
  briefing = await seedBriefing(ownerDb(), w.A);
  const booked = (startsAt: Date) => seedBooking(w.A, { startsAt, status: BookingStatus.departed });
  jans = (await booked(ago(20))).id as BookingId;
  anna = (await booked(ago(19))).id as BookingId;
  byPlateOnly = (await booked(ago(18))).id as BookingId;
  await setAvis(jans, {
    driverName: JAN,
    driverPhone: '+48600123456',
    plate: 'WA12345',
    plateSeen: 'WA12345',
  });
  await setAvis(anna, { driverName: 'Anna Nowak', driverPhone: '+49151000000', plate: 'HH1234' });
  // Another driver of the same truck: found by the plate, not by the name.
  await setAvis(byPlateOnly, { driverName: 'Piotr Zieliński', trailerPlate: 'WA12345' });
  const ack = (
    driverName: string,
    completedAt: Date,
    expiresAt: Date | null,
    bookingId?: BookingId,
  ) => seedAcknowledgement(w.A, briefing, { driverName, completedAt, expiresAt, bookingId });
  acks.held = (await ack('jan kowalski', ago(20), ago(-345))).id;
  acks.expired = (await ack(JAN, ago(4 * 365), ago(3 * 365))).id;
  acks.linked = (await ack('J. Kowalski', ago(20), null, jans)).id;
  acks.other = (await ack('Anna Nowak', ago(19), ago(-346))).id;
});

const post = (path: string, body: unknown, user = w.A.users.tenant_admin) =>
  as(app, user).post(`/api/t/${w.A.tenantId}/privacy/${path}`, { body });

const search = async (body: unknown) => {
  const res = await post('search', body);
  expect(res.status).toBe(200);
  return (await res.json()) as SubjectMatches;
};

describe('TN-06 data subject requests', () => {
  it('finds a driver by whole name in any case, with the acknowledgements of their bookings', async () => {
    const found = await search({ name: '  JAN KOWALSKI ' });
    expect(found.bookings.map((b) => b.id)).toEqual([jans]);
    expect(found.bookings[0]).toMatchObject({
      driverName: JAN,
      driverPhone: '+48600123456',
      plate: 'WA12345',
    });
    expect(found.acknowledgements.map((a) => a.id).sort()).toEqual(
      [acks.held, acks.expired, acks.linked].sort(),
    );
    expect(found.acknowledgements.find((a) => a.id === acks.expired)?.retentionEnded).toBe(true);
    expect((await search({ name: 'Kowalski' })).bookings).toEqual([]);
  });

  it('finds a driver by phone or plate in any notation', async () => {
    expect((await search({ phone: '0048 600 123 456' })).bookings.map((b) => b.id)).toEqual([jans]);
    expect((await search({ plate: 'wa-12345' })).bookings.map((b) => b.id).sort()).toEqual(
      [jans, byPlateOnly].sort(),
    );
  });

  it('refuses a search without an identifier and with a foreign permission', async () => {
    expect((await post('search', { name: ' ', phone: '' })).status).toBe(422);
    expect((await post('search', { name: JAN }, w.A.users.dispatcher)).status).toBe(403);
  });

  it('exports matching bookings and acknowledgements as JSON and logs counts only', async () => {
    const res = await post('export', { name: JAN });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="privacy-export-/,
    );
    const body = (await res.json()) as SubjectMatches & { exportedAt: string };
    expect(body.exportedAt).toBe(NOW.toISOString());
    expect(body.bookings).toHaveLength(1);
    expect(body.acknowledgements).toHaveLength(3);
    const logs = await ownerDb()
      .select()
      .from(privacyRequestLog)
      .where(eq(privacyRequestLog.tenantId, w.A.tenantId));
    expect(logs).toEqual([
      expect.objectContaining({
        kind: PrivacyRequestKind.export,
        matchedBookings: 1,
        matchedAcknowledgements: 3,
        actorUserId: w.A.users.tenant_admin.id,
      }),
    ]);
    expect(JSON.stringify(logs)).not.toContain('Kowalski');
  });

  it('erases only after confirmation: pseudonymizes bookings, restricts what retention holds', async () => {
    expect((await post('erase', { name: JAN })).status).toBe(422);
    const res = await post('erase', { name: JAN, confirm: true });
    expect(res.status).toBe(200);
    expect((await res.json()) as EraseResult).toEqual({
      pseudonymizedBookings: 1,
      restrictedAcknowledgements: 2,
      pseudonymizedAcknowledgements: 1,
    });

    expect(await avisOf(jans)).toMatchObject({
      driverName: null,
      driverPhone: null,
      plate: null,
      trailerPlate: null,
      plateSeen: null,
      phoneErasedAt: NOW,
      pseudonymizedAt: NOW,
      counterpartyName: 'Lieferant GmbH',
    });
    expect(await acknowledgementOf(acks.held)).toMatchObject({
      driverName: 'jan kowalski',
      restrictedAt: NOW,
      pseudonymizedAt: null,
    });
    expect(await acknowledgementOf(acks.linked)).toMatchObject({ restrictedAt: NOW });
    expect(await acknowledgementOf(acks.expired)).toMatchObject({
      driverName: '',
      pseudonymizedAt: NOW,
      restrictedAt: null,
    });
    expect(await avisOf(anna)).toMatchObject({ driverName: 'Anna Nowak', pseudonymizedAt: null });
    expect(await acknowledgementOf(acks.other)).toMatchObject({ restrictedAt: null });
    expect(await avisOf(byPlateOnly)).toMatchObject({ trailerPlate: 'WA12345' });

    // Restricted acknowledgements stay stored, so a later request still finds them.
    const after = await search({ name: JAN });
    expect(after.bookings).toEqual([]);
    expect(after.acknowledgements.map((a) => a.id)).toEqual([acks.held]);
    expect(after.acknowledgements[0]?.restrictedAt).toBe(NOW.toISOString());
  });
});
