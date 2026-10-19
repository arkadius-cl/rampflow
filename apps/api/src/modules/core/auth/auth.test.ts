import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerCount, ownerDb } from '../../../../test/db.ts';
import { TEST_ORIGIN } from '../../../../test/http.ts';
import { createApp } from '../../../app.ts';
import type { UserId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { account, FIXTURE_PASSWORD } from './fixtures.ts';

// CR-03 and ADR-0003 against the real HTTP surface and Postgres. The client address comes from
// the Node socket binding, as @hono/node-server passes it.

const START = new Date('2026-11-02T08:00:00Z');

function harness() {
  const clock = testClock(START);
  const app = createApp({ clock });
  const request = (
    method: string,
    path: string,
    o: { body?: unknown; cookie?: string; ip?: string } = {},
  ) =>
    app.request(
      path,
      {
        method,
        headers: {
          Origin: TEST_ORIGIN,
          ...(o.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(o.cookie ? { Cookie: `rf_session=${o.cookie}` } : {}),
        },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      },
      { incoming: { socket: { remoteAddress: o.ip ?? '192.0.2.10' } } } as never,
    );
  const login = (email: string, password: string, ip?: string) =>
    request('POST', '/api/auth/login', { body: { email, password }, ip });
  return { app, clock, request, login };
}

const sessionOf = (res: Response) =>
  /rf_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null;

const sessionsOf = (userId: UserId) => ownerCount('session', sql`user_id = ${userId}`);

/** The link token of the last email to `to`, derived from the outbox payload like the template does. */
async function linkTokenTo(to: string, purpose: 'magic_link' | 'password_reset') {
  const rows = await ownerDb().select().from(outboxMessage).where(eq(outboxMessage.toEmail, to));
  const payload = rows.at(-1)?.payload as { authTokenId?: string } | undefined;
  if (!payload?.authTokenId) throw new Error(`no ${purpose} email to ${to}`);
  return deriveToken(purpose, payload.authTokenId);
}

describe('password sign-in (CR-03)', () => {
  it('signs in with the right password and the session reaches /api/me', async () => {
    const { login, request } = harness();
    const a = await account(ownerDb());
    const res = await login(a.email, a.password);
    expect(res.status).toBe(200);
    const cookie = sessionOf(res);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    const me = await request('GET', '/api/me', { cookie: cookie ?? '' });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe(a.id);
  });

  it('refuses a wrong password, an unknown email and an unverified email alike', async () => {
    const { login } = harness();
    const a = await account(ownerDb());
    const unverified = await account(ownerDb(), { verified: false });
    const disabled = await account(ownerDb(), { disabled: true });
    const answers = [
      await login(a.email, 'not the password'),
      await login('nobody-here@auth.test', FIXTURE_PASSWORD),
      await login(unverified.email, unverified.password),
      await login(disabled.email, disabled.password),
    ];
    for (const res of answers) {
      expect(res.status).toBe(401);
      expect(sessionOf(res)).toBeNull();
      expect(await res.json()).toEqual({
        error: { code: 'unauthorized', message: 'Wrong email or password' },
      });
    }
    expect(await sessionsOf(unverified.id)).toBe(0);
  });

  it('spends the scrypt cost on an unknown email too (dummy-hash path)', async () => {
    const { login } = harness();
    const a = await account(ownerDb());
    const timed = async (email: string) => {
      const t0 = performance.now();
      await login(email, 'wrong password 123');
      return performance.now() - t0;
    };
    await timed(a.email);
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 3; i++) {
      known.push(await timed(a.email));
      unknown.push(await timed(`ghost-${i}@auth.test`));
    }
    const median = (xs: number[]) => xs.sort((x, y) => x - y)[1] ?? 0;
    expect(median(unknown)).toBeGreaterThan(median(known) * 0.5);
  });

  it('answers 429 after five failures for one email and address; another address still signs in', async () => {
    const { login } = harness();
    const a = await account(ownerDb());
    for (let i = 0; i < 5; i++) {
      expect((await login(a.email, 'wrong password', '198.51.100.7')).status).toBe(401);
    }
    const blocked = await login(a.email, a.password, '198.51.100.7');
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as {
      error: { code: string; details: { retryAfterSeconds: number } };
    };
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect((await login(a.email, a.password, '203.0.113.9')).status).toBe(200);
  });

  it('lets five concurrent wrong passwords through the check at most once each', async () => {
    const { login } = harness();
    const a = await account(ownerDb());
    const burst = await Promise.all(
      Array.from({ length: 8 }, () => login(a.email, 'wrong password', '198.51.100.8')),
    );
    expect(burst.map((r) => r.status).sort()).toEqual([401, 401, 401, 401, 401, 429, 429, 429]);
  });

  it('signs out: the session row is gone and the cookie no longer works', async () => {
    const { login, request } = harness();
    const a = await account(ownerDb());
    const cookie = sessionOf(await login(a.email, a.password)) ?? '';
    expect((await request('POST', '/api/auth/logout', { cookie })).status).toBe(204);
    expect(await sessionsOf(a.id)).toBe(0);
    expect((await request('GET', '/api/me', { cookie })).status).toBe(401);
  });
});

describe('magic link (CR-03)', () => {
  it('signs in once and refuses the same link again', async () => {
    const { request } = harness();
    const a = await account(ownerDb());
    const sent = await request('POST', '/api/auth/magic-link', { body: { email: a.email } });
    expect(sent.status).toBe(202);
    const token = await linkTokenTo(a.email, 'magic_link');
    const first = await request('POST', '/api/auth/magic-link/exchange', { body: { token } });
    expect(first.status).toBe(200);
    expect(sessionOf(first)).not.toBeNull();
    const again = await request('POST', '/api/auth/magic-link/exchange', { body: { token } });
    expect(again.status).toBe(401);
  });

  it('expires after 15 minutes', async () => {
    const { request, clock } = harness();
    const a = await account(ownerDb());
    await request('POST', '/api/auth/magic-link', { body: { email: a.email } });
    const token = await linkTokenTo(a.email, 'magic_link');
    clock.advance(15 * 60_000);
    const late = await request('POST', '/api/auth/magic-link/exchange', { body: { token } });
    expect(late.status).toBe(401);
    expect(await sessionsOf(a.id)).toBe(0);
  });

  it('creates one session when two exchanges race', async () => {
    const { request } = harness();
    const a = await account(ownerDb());
    await request('POST', '/api/auth/magic-link', { body: { email: a.email } });
    const token = await linkTokenTo(a.email, 'magic_link');
    const both = await Promise.all([
      request('POST', '/api/auth/magic-link/exchange', { body: { token } }),
      request('POST', '/api/auth/magic-link/exchange', { body: { token } }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await sessionsOf(a.id)).toBe(1);
  });

  it('answers 202 for an unknown email and sends nothing', async () => {
    const { request } = harness();
    const email = 'nobody-magic@auth.test';
    const res = await request('POST', '/api/auth/magic-link', { body: { email } });
    expect(res.status).toBe(202);
    expect(await ownerCount('outbox_message', sql`to_email = ${email}`)).toBe(0);
  });

  it('stops sending after five requests an hour for one email', async () => {
    const { request } = harness();
    const a = await account(ownerDb());
    for (let i = 0; i < 7; i++) {
      const res = await request('POST', '/api/auth/magic-link', { body: { email: a.email } });
      expect(res.status).toBe(202);
    }
    expect(await ownerCount('outbox_message', sql`to_email = ${a.email}`)).toBe(5);
  });
});

describe('password reset (CR-03)', () => {
  it('sets the new password and revokes every other session', async () => {
    const { request, login } = harness();
    const a = await account(ownerDb());
    const laptop = sessionOf(await login(a.email, a.password)) ?? '';
    const phone = sessionOf(await login(a.email, a.password)) ?? '';
    expect(await sessionsOf(a.id)).toBe(2);

    await request('POST', '/api/auth/password-reset', { body: { email: a.email, locale: 'pl' } });
    const token = await linkTokenTo(a.email, 'password_reset');
    const done = await request('POST', '/api/auth/password-reset/confirm', {
      body: { token, password: 'a brand new secret' },
    });
    expect(done.status).toBe(200);
    const fresh = sessionOf(done) ?? '';

    expect((await request('GET', '/api/me', { cookie: laptop })).status).toBe(401);
    expect((await request('GET', '/api/me', { cookie: phone })).status).toBe(401);
    expect((await request('GET', '/api/me', { cookie: fresh })).status).toBe(200);
    expect(await sessionsOf(a.id)).toBe(1);
    expect((await login(a.email, a.password)).status).toBe(401);
    expect((await login(a.email, 'a brand new secret')).status).toBe(200);
  });

  it('rejects a short password with 422 and keeps the link usable', async () => {
    const { request } = harness();
    const a = await account(ownerDb());
    await request('POST', '/api/auth/password-reset', { body: { email: a.email } });
    const token = await linkTokenTo(a.email, 'password_reset');
    const short = await request('POST', '/api/auth/password-reset/confirm', {
      body: { token, password: 'short' },
    });
    expect(short.status).toBe(422);
    expect(await short.json()).toMatchObject({
      error: { code: 'validation_failed', details: { issues: [{ path: ['password'] }] } },
    });
    const ok = await request('POST', '/api/auth/password-reset/confirm', {
      body: { token, password: 'long enough now' },
    });
    expect(ok.status).toBe(200);
  });

  it('expires after 60 minutes', async () => {
    const { request, clock } = harness();
    const a = await account(ownerDb());
    await request('POST', '/api/auth/password-reset', { body: { email: a.email } });
    const token = await linkTokenTo(a.email, 'password_reset');
    clock.advance(60 * 60_000);
    const late = await request('POST', '/api/auth/password-reset/confirm', {
      body: { token, password: 'too late for this' },
    });
    expect(late.status).toBe(401);
  });
});

describe('logs', () => {
  const lines: string[] = [];
  beforeEach(() => {
    lines.length = 0;
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(
          args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '),
        );
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());

  it('hold no token, cookie or password through sign-in, magic link and reset', async () => {
    const { request, login } = harness();
    const a = await account(ownerDb());
    const secrets: string[] = [a.password, 'the new password 1'];
    await login(a.email, 'wrong guess 12345');
    secrets.push('wrong guess 12345');
    const signedIn = await login(a.email, a.password);
    secrets.push(sessionOf(signedIn) ?? '');
    await request('POST', '/api/auth/magic-link', { body: { email: a.email } });
    const magic = await linkTokenTo(a.email, 'magic_link');
    secrets.push(magic);
    secrets.push(
      sessionOf(
        await request('POST', '/api/auth/magic-link/exchange', { body: { token: magic } }),
      ) ?? '',
    );
    await request('POST', '/api/auth/password-reset', { body: { email: a.email } });
    const reset = await linkTokenTo(a.email, 'password_reset');
    secrets.push(reset);
    await request('POST', '/api/auth/password-reset/confirm', {
      body: { token: reset, password: 'the new password 1' },
    });
    await request('POST', '/api/auth/magic-link/exchange', { body: { token: 'x'.repeat(43) } });

    const output = lines.join('\n');
    for (const secret of secrets.filter((s) => s.length > 0)) {
      expect(output).not.toContain(secret);
    }
  });
});
