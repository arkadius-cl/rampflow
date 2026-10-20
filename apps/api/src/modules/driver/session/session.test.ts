import { randomBytes } from 'node:crypto';
import { ConsoleMethod, ErrorCode, values } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { world } from '../../../../test/world.ts';
import type { DriverAccessId } from '../access.ts';
import { driverAccess } from '../schema.ts';
import { driverHarness } from './fixtures.ts';

describe('DR-01 open the link', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exchanges the token for an HttpOnly, Strict cookie on /api/driver that opens the booking', async () => {
    const { open, request } = driverHarness();
    const w = await world();
    const { res, jar } = await open(w.A.bookings.own.driverToken);
    expect(res.status).toBe(204);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`rf_driver=${w.A.bookings.own.driverToken}`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/driver(;|$)/);
    // Valid until starts_at + 7 days: 2026-11-09T08:00Z, 7 days and one hour after 07:00Z.
    expect(cookie).toContain(`Max-Age=${7 * 86_400 + 3_600}`);

    const view = await request('GET', '/api/driver/booking', { jar });
    expect(view.status).toBe(200);
    expect(((await view.json()) as { booking: { code: string } }).booking.code).toBe(
      w.A.bookings.own.code,
    );
  });

  it('answers unknown, expired and revoked tokens with the same 401', async () => {
    const { open, clock } = driverHarness();
    const w = await world();
    const unknown = await open(randomBytes(32).toString('base64url'));
    await ownerDb()
      .update(driverAccess)
      .set({ revokedAt: new Date('2026-11-01T00:00:00Z') })
      .where(eq(driverAccess.id, w.A.bookings.rival.driverAccessId as DriverAccessId));
    const revoked = await open(w.A.bookings.rival.driverToken);
    clock.set(new Date('2026-11-09T08:00:01Z'));
    const expired = await open(w.A.bookings.own.driverToken);
    const answers = [];
    for (const { res } of [unknown, revoked, expired]) {
      expect(res.headers.get('set-cookie')).toBeNull();
      answers.push({ status: res.status, body: await res.json() });
    }
    expect(answers[0]).toMatchObject({
      status: 401,
      body: { error: { code: ErrorCode.unauthorized } },
    });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it('answers the eleventh exchange in a minute from one address with 429', async () => {
    const { open, clock } = driverHarness();
    const w = await world();
    for (let i = 0; i < 10; i++) {
      expect((await open(w.A.bookings.own.driverToken)).res.status).toBe(204);
      clock.advance(1_000);
    }
    const blocked = (await open(w.A.bookings.own.driverToken)).res;
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe('rate_limited');
    clock.advance(60_000);
    expect((await open(w.A.bookings.own.driverToken)).res.status).toBe(204);
  });

  it('logs neither the token nor the cookie', async () => {
    const { open, request } = driverHarness();
    const w = await world();
    const lines: string[] = [];
    for (const level of values(ConsoleMethod)) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
    const { jar } = await open(w.A.bookings.own.driverToken);
    await request('GET', '/api/driver/booking', { jar });
    await open('not-a-token-of-ours');
    expect(lines.filter((l) => l.includes(w.A.bookings.own.driverToken))).toEqual([]);
  });

  it('DELETE /api/driver/session clears the cookie, so the next poll answers 401', async () => {
    const { open, request } = driverHarness();
    const w = await world();
    const { jar } = await open(w.A.bookings.own.driverToken);
    const res = await request('DELETE', '/api/driver/session', { jar });
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toMatch(/rf_driver=;.*Max-Age=0.*Path=\/api\/driver/);
    expect(jar.has('rf_driver')).toBe(false);
    expect((await request('GET', '/api/driver/booking', { jar })).status).toBe(401);
  });
});
