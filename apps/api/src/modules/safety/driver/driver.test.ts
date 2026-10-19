import { randomUUID } from 'node:crypto';
import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import type {
  AttemptResult,
  DriverBriefingContent,
  DriverBriefingList,
} from '@rampflow/shared/modules/safety/api.driver';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../../../test/db.ts';
import { type WorldBooking, type WorldSide, world } from '../../../../test/world.ts';
import { type BookingId, hashToken, type TenantId, wrapJson } from '../../../db/ids.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { settingValue } from '../../core/schema.ts';
import { driverAccess } from '../../driver/schema.ts';
import { driverHarness, type Jar } from '../../driver/session/fixtures.ts';
import { briefingOf, QUIZ, seedBriefing } from '../authoring/fixtures.ts';
import { safetyAcknowledgement, safetyContent } from '../schema.ts';

const P = '/api/driver/briefings';
const right = Object.fromEntries(QUIZ.map((q) => [q.id, q.correct]));
const wrongFirst = { ...right, q1: 1 };
const DAY_MS = 86_400_000;

type Harness = ReturnType<typeof driverHarness>;

/** Reads, answers and acknowledges the side's briefing on the phone of `jar`. */
async function completeBriefing(h: Harness, side: WorldSide, jar: Jar, name = 'Dana Driver') {
  const { instructionId } = briefingOf(side);
  const attempt = await h.request('POST', `${P}/${instructionId}/attempts`, {
    jar,
    body: { locale: 'en', answers: right },
  });
  expect(attempt.status).toBe(200);
  const ack = await h.request('POST', `${P}/${instructionId}/acknowledgement`, {
    jar,
    body: { locale: 'en', name, confirmed: true },
  });
  expect(ack.status).toBe(201);
  return ack;
}

const countsFor = async (tenantId: string) => {
  const t = sql`tenant_id = ${tenantId}`;
  return {
    bookingAcknowledgement: await ownerCount('booking_acknowledgement', t),
    bookingEvent: await ownerCount('booking_event', t),
    safetyPass: await ownerCount('safety_pass', t),
    safetyAcknowledgement: await ownerCount('safety_acknowledgement', t),
  };
};

async function setValidityDays(side: WorldSide, days: number) {
  await ownerDb()
    .insert(settingValue)
    .values({
      tenantId: side.tenantId as TenantId,
      key: 'safety.validity_days',
      value: wrapJson(days),
      updatedBy: side.users.tenant_admin.id,
    });
}

/** A 30-minute gate-device session for the booking (YD-02), as U9's briefing-session route issues. */
async function gateDeviceToken(side: WorldSide, b: WorldBooking, now: Date): Promise<string> {
  const id = randomUUID();
  const token = deriveToken('driver', id);
  await ownerDb()
    .insert(driverAccess)
    .values({
      id: id as never,
      tenantId: side.tenantId as TenantId,
      siteId: b.siteId as never,
      bookingId: b.id as BookingId,
      carrierId: b.carrierId as never,
      tokenHash: hashToken(token),
      channel: 'staff',
      expiresAt: new Date(now.getTime() + 30 * 60_000),
    });
  return token;
}

describe('SF-04 complete the briefing', () => {
  it('counts a failed quiz, refuses the acknowledgement until it passes, then stores every field', async () => {
    const h = driverHarness();
    const w = await world();
    const { instructionId, publishedId } = await seedBriefing(ownerDb(), w.A);
    const visit = w.A.bookings.rival;
    const { jar } = await h.open(visit.driverToken);

    const list = (await (await h.request('GET', P, { jar })).json()) as DriverBriefingList;
    expect(list.items).toEqual([
      {
        instructionId,
        name: 'Site rules',
        status: 'missing',
        expiresAt: null,
        quiz: true,
        locales: [{ locale: 'en', translation: 'source' }],
      },
    ]);

    // Polish is not published, so the content falls back to en; answers stay on the server.
    const content = (await (
      await h.request('GET', `${P}/${instructionId}?locale=pl`, { jar })
    ).json()) as DriverBriefingContent;
    expect(content).toMatchObject({
      locale: 'en',
      version: 1,
      statement: 'I will follow the rules.',
    });
    expect(content.questions).toHaveLength(3);
    expect(JSON.stringify(content)).not.toContain('correct');

    const failed = await h.request('POST', `${P}/${instructionId}/attempts`, {
      jar,
      body: { locale: 'en', answers: wrongFirst },
    });
    expect((await failed.json()) as AttemptResult).toEqual({
      score: 67,
      passed: false,
      attempts: 1,
      wrong: ['q1'],
    });
    const early = await h.request('POST', `${P}/${instructionId}/acknowledgement`, {
      jar,
      body: { locale: 'en', name: 'Dana Driver', confirmed: true },
    });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ error: { details: { reason: 'quiz_not_passed' } } });

    const ack = await completeBriefing(h, w.A, jar);
    const now = h.clock.now();
    expect(await ack.json()).toEqual({
      expiresAt: new Date(now.getTime() + 365 * DAY_MS).toISOString(),
    });
    expect(ack.headers.get('set-cookie')).toMatch(/rf_device=[^;]+;.*HttpOnly/);

    const [row] = await ownerDb()
      .select()
      .from(safetyAcknowledgement)
      .where(eq(safetyAcknowledgement.bookingId, visit.id as BookingId));
    const [published] = await ownerDb()
      .select({ hash: safetyContent.contentHash })
      .from(safetyContent)
      .where(and(eq(safetyContent.versionId, publishedId), eq(safetyContent.locale, 'en')));
    expect(row).toMatchObject({
      instructionId,
      versionId: publishedId,
      locale: 'en',
      contentHash: published?.hash,
      score: 100,
      attempts: 2,
      driverName: 'Dana Driver',
      statementShown: 'I will follow the rules.',
      channel: 'link',
      completedAt: now,
      expiresAt: new Date(now.getTime() + 365 * DAY_MS),
    });
    expect(await ownerCount('safety_pass', sql`acknowledgement_id = ${row?.id}`)).toBe(1);
    const view = (await (
      await h.request('GET', '/api/driver/booking', { jar })
    ).json()) as DriverBookingView;
    expect(view.safety).toEqual({ status: 'valid', validUntil: row?.expiresAt?.toISOString() });
  });

  it('stores a visit-only acknowledgement and keeps no pass with safety.validity_days 0', async () => {
    const h = driverHarness();
    const w = await world();
    await seedBriefing(ownerDb(), w.A);
    await setValidityDays(w.A, 0);
    const { jar } = await h.open(w.A.bookings.rival.driverToken);
    const ack = await completeBriefing(h, w.A, jar);
    expect(await ack.json()).toEqual({ expiresAt: null });
    expect(ack.headers.get('set-cookie')).toBeNull();
    expect(await ownerCount('safety_pass', sql`tenant_id = ${w.A.tenantId}`)).toBe(0);
  });

  it('shows "valid until" for the next booking at the tenant on the same phone; polls write nothing', async () => {
    const h = driverHarness();
    const w = await world();
    const { instructionId } = await seedBriefing(ownerDb(), w.A);
    const { jar } = await h.open(w.A.bookings.rival.driverToken);
    await completeBriefing(h, w.A, jar);
    expect(jar.has('rf_device')).toBe(true);

    // The same phone opens the link of the next visit at the tenant.
    const next = w.A.bookings.otherSite;
    expect((await h.open(next.driverToken, jar)).res.status).toBe(204);
    const before = await countsFor(w.A.tenantId);
    for (let i = 0; i < 3; i++) {
      const poll = (await (
        await h.request('GET', '/api/driver/booking', { jar })
      ).json()) as DriverBookingView;
      expect(poll.safety.status).toBe('missing');
      h.clock.advance(15_000);
    }
    expect(await countsFor(w.A.tenantId)).toEqual(before);

    const list = (await (await h.request('GET', P, { jar })).json()) as DriverBriefingList;
    expect(list.items[0]).toMatchObject({ instructionId, status: 'valid' });
    expect(list.items[0]?.expiresAt).not.toBeNull();
    const after = await countsFor(w.A.tenantId);
    expect(after).toEqual({
      ...before,
      bookingAcknowledgement: before.bookingAcknowledgement + 1,
      bookingEvent: before.bookingEvent + 1,
    });
    expect(
      await ownerCount(
        'booking_event',
        sql`booking_id = ${next.id} and type = 'safety_linked' and data->>'via' = 'pass'`,
      ),
    ).toBe(1);

    await h.request('GET', P, { jar });
    expect(await countsFor(w.A.tenantId)).toEqual(after);
    const view = (await (
      await h.request('GET', '/api/driver/booking', { jar })
    ).json()) as DriverBookingView;
    expect(view.safety).toEqual({ status: 'valid', validUntil: list.items[0]?.expiresAt });
  });

  it('never redeems a pass at another tenant', async () => {
    const h = driverHarness();
    const w = await world();
    await seedBriefing(ownerDb(), w.A);
    await seedBriefing(ownerDb(), w.B);
    const { jar } = await h.open(w.A.bookings.rival.driverToken);
    await completeBriefing(h, w.A, jar);
    await h.open(w.B.bookings.rival.driverToken, jar);
    const list = (await (await h.request('GET', P, { jar })).json()) as DriverBriefingList;
    expect(list.items[0]?.status).toBe('missing');
  });

  it('a gate-device session records channel staff, sets no device cookie and keeps no pass', async () => {
    const h = driverHarness();
    const w = await world();
    await seedBriefing(ownerDb(), w.A);
    const token = await gateDeviceToken(w.A, w.A.bookings.rival, h.clock.now());
    const { jar } = await h.open(token);
    const ack = await completeBriefing(h, w.A, jar, 'Gina Gatehouse');
    expect(ack.headers.get('set-cookie')).toBeNull();
    const [row] = await ownerDb()
      .select({ channel: safetyAcknowledgement.channel })
      .from(safetyAcknowledgement)
      .where(eq(safetyAcknowledgement.driverName, 'Gina Gatehouse'));
    expect(row?.channel).toBe('staff');
    expect(await ownerCount('safety_pass', sql`tenant_id = ${w.A.tenantId}`)).toBe(0);
  });

  it('a gate-device session never redeems the passes of a phone', async () => {
    const h = driverHarness();
    const w = await world();
    await seedBriefing(ownerDb(), w.A);
    const { jar } = await h.open(w.A.bookings.rival.driverToken);
    await completeBriefing(h, w.A, jar);
    const token = await gateDeviceToken(w.A, w.A.bookings.otherSite, h.clock.now());
    await h.open(token, jar);
    const list = (await (await h.request('GET', P, { jar })).json()) as DriverBriefingList;
    expect(list.items[0]?.status).toBe('missing');
  });
});
