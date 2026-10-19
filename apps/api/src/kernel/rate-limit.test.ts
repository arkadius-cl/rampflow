import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { as } from '../../test/http.ts';
import { testClock } from './clock.ts';
import type { AppEnv } from './env.ts';
import { ApiError, onError } from './errors.ts';
import { clientIp, rateLimit, rateLimitState, recordRateLimitEvent } from './rate-limit.ts';
import { scoped } from './scoped.ts';
import { anonymousScope } from './scopes.ts';

const clock = testClock(new Date('2026-11-02T08:00:00Z'));

/** A sign-in stand-in: every attempt fails with 401 inside a scoped, rolled-back transaction. */
function loginApp(email: string) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('clock', clock);
      await next();
    })
    .use(scoped(anonymousScope))
    .post('/login', async (c) => {
      const key = `${email}|${clientIp(c)}`;
      const state = await rateLimitState('login_failed', key, c.var.clock.now());
      if (state.limited) {
        throw new ApiError('rate_limited', 'Too many attempts', {
          retryAfterSeconds: state.retryAfterSeconds,
        });
      }
      await recordRateLimitEvent('login_failed', key, c.var.clock.now());
      throw new ApiError('unauthorized', 'Wrong password');
    })
    .onError(onError);
}

describe('rate limits', () => {
  it('counts failures inside rolled-back requests: five 401s, then 429', async () => {
    const app = loginApp(`${randomUUID()}@rate.test`);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await as(app, null).post('/login')).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    clock.advance(15 * 60_000 + 1000);
    expect((await as(app, null).post('/login')).status).toBe(401);
  });

  it('reports when the oldest attempt leaves the window', async () => {
    const key = randomUUID();
    const at = new Date('2026-11-02T09:00:00Z');
    for (let i = 0; i < 5; i++)
      await recordRateLimitEvent('login_failed', key, new Date(at.getTime() + i * 60_000));
    expect(await rateLimitState('login_failed', key, new Date(at.getTime() + 5 * 60_000))).toEqual({
      limited: true,
      retryAfterSeconds: 600,
    });
  });

  it('the middleware form lets the limit through and then answers 429 with retryAfterSeconds', async () => {
    const ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const app = new Hono<AppEnv>()
      .use(async (c, next) => {
        c.set('clock', clock);
        await next();
      })
      .post(
        '/exchange',
        rateLimit('driver_exchange', () => ip),
        (c) => c.json({ ok: true }),
      )
      .onError(onError);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await as(app, null).post('/exchange')).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    const last = await as(app, null).post('/exchange');
    expect(last.status).toBe(429);
    expect(await last.json()).toMatchObject({
      error: { code: 'rate_limited', details: { retryAfterSeconds: 60 } },
    });
  });
});

describe('clientIp', () => {
  const ipApp = (trustProxy: boolean) =>
    new Hono().get('/', (c) => c.text(clientIp(c, trustProxy)));

  it('uses the last X-Forwarded-For entry only behind a trusted proxy', async () => {
    const headers = { 'X-Forwarded-For': '1.1.1.1, 203.0.113.7' };
    expect(await (await ipApp(true).request('/', { headers })).text()).toBe('203.0.113.7');
    expect(await (await ipApp(false).request('/', { headers })).text()).toBe('unknown');
  });
});
