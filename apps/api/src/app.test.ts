import { zValidator } from '@hono/zod-validator';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { ownerDb } from '../test/db.ts';
import { as, TEST_ORIGIN } from '../test/http.ts';
import { app, createApp } from './app.ts';
import { parseEnv } from './kernel/env.ts';
import { onError } from './kernel/errors.ts';
import { requireSameOrigin } from './kernel/origin.ts';
import { onInvalid } from './kernel/validate.ts';
import { appUser } from './modules/core/schema.ts';

describe('api', () => {
  it('reports ok health against the real database', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('answers unknown routes with the JSON error envelope', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'No such route' } });
  });

  it('test routes seed a world, pin the clock and run a job tick', async () => {
    const testApp = createApp({ testRoutes: true });
    const seeded = await as(testApp, null).post('/api/test/seed', { body: { scenario: 'world' } });
    expect(seeded.status).toBe(201);
    expect(await seeded.json()).toMatchObject({ A: { tenantId: expect.any(String) } });
    const pinned = await as(testApp, null).post('/api/test/clock', {
      body: { now: '2026-10-25T00:30:00.000Z' },
    });
    expect(await pinned.json()).toEqual({ now: '2026-10-25T00:30:00.000Z' });
    const released = await as(testApp, null).post('/api/test/clock', { body: { now: null } });
    expect((await released.json()).now).not.toBe('2026-10-25T00:30:00.000Z');
    const tick = await as(testApp, null).post('/api/test/jobs/outbox/run');
    expect(await tick.json()).toMatchObject({ ran: true });
  });

  it('mounts the test routes only when asked', async () => {
    const off = createApp({ testRoutes: false });
    expect((await as(off, null).post('/api/test/jobs/outbox/run')).status).toBe(404);
  });
});

describe('Origin check', () => {
  const LAN_ORIGIN = 'http://192.168.0.10:5173';
  const echo = () =>
    new Hono()
      .use(requireSameOrigin([TEST_ORIGIN, `${LAN_ORIGIN}/`]))
      .get('/x', (c) => c.text('read'))
      .post('/x', (c) => c.text('written'))
      .onError(onError);

  it('refuses a POST without Origin or with a foreign one', async () => {
    for (const origin of [null, 'https://evil.example']) {
      const res = await as(echo(), null).post('/x', { origin });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        error: { code: 'forbidden', details: { reason: 'origin' } },
      });
    }
  });

  it('accepts a same-origin POST and any GET', async () => {
    expect((await as(echo(), null).post('/x')).status).toBe(200);
    expect((await as(echo(), null).post('/x', { origin: LAN_ORIGIN })).status).toBe(200);
    expect((await as(echo(), null).get('/x', { origin: null })).status).toBe(200);
  });

  it('accepts only the origins the app was built with', async () => {
    const lan = createApp({ origins: [TEST_ORIGIN, LAN_ORIGIN] });
    const fromLan = await as(lan, null).post('/api/auth/anything', { origin: LAN_ORIGIN });
    expect(fromLan.status).toBe(404);
    const strict = createApp({ origins: [TEST_ORIGIN] });
    const refused = await as(strict, null).post('/api/auth/anything', { origin: LAN_ORIGIN });
    expect(refused.status).toBe(403);
  });

  it('runs before routing in the real app', async () => {
    const res = await as(app, null).post('/api/auth/anything', { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });
});

describe('validation', () => {
  const validated = () =>
    new Hono()
      .post(
        '/items/:id',
        zValidator('param', z.object({ id: z.uuid() }), onInvalid),
        zValidator('json', z.object({ avis: z.object({ plate: z.string().min(2) }) }), onInvalid),
        (c) => c.json(c.req.valid('json')),
      )
      .onError(onError);

  it('answers a malformed path id with 404, like an unknown one', async () => {
    const res = await as(validated(), null).post('/items/nope', {
      body: { avis: { plate: 'HH' } },
    });
    expect(res.status).toBe(404);
  });

  it('answers a bad body with 422 and the zod issue path', async () => {
    const res = await as(validated(), null).post(`/items/${crypto.randomUUID()}`, {
      body: { avis: { plate: 'H' } },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: {
        code: 'validation_failed',
        details: { issues: [{ path: ['avis', 'plate'], code: 'too_small' }] },
      },
    });
  });

  it('answers malformed JSON with 400 bad_request', async () => {
    const res = await validated().request(`/items/${crypto.randomUUID()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'bad_request' } });
  });
});

describe('internal errors', () => {
  afterEach(() => vi.restoreAllMocks());

  it('log the error class and SQL state, never the bound parameters', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(
        args
          .map((a) =>
            a instanceof Error ? `${a.message} ${a.stack} ${String(a.cause)}` : String(a),
          )
          .join(' '),
      );
    });
    const email = `victim-${crypto.randomUUID()}@example.com`;
    const passwordHash = 'scrypt$16384$16$1$SALT$SECRETHASH';
    const failing = new Hono()
      .get('/duplicate', async (c) => {
        const row = { email, name: 'Victim', passwordHash };
        await ownerDb().insert(appUser).values(row);
        await ownerDb().insert(appUser).values(row);
        return c.body(null, 204);
      })
      .get('/cast', async (c) => {
        await ownerDb().execute(sql`select ${email}::int`);
        return c.body(null, 204);
      })
      .onError(onError);

    expect((await failing.request('/duplicate')).status).toBe(500);
    expect((await failing.request('/cast')).status).toBe(500);
    const output = lines.join('\n');
    expect(output).toContain('23505');
    expect(output).toContain('22P02');
    expect(output).not.toContain(email);
    expect(output).not.toContain('SECRETHASH');
  });
});

describe('environment', () => {
  const base = { DATABASE_URL: 'postgres://rampflow_app:x@localhost:5432/x' };

  it('refuses test routes in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        ENABLE_TEST_ROUTES: '1',
        TOKEN_SECRET: 'x'.repeat(40),
      }),
    ).toThrow(/ENABLE_TEST_ROUTES/);
  });

  it('refuses the API docs in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        ENABLE_API_DOCS: '1',
        TOKEN_SECRET: 'x'.repeat(40),
      }),
    ).toThrow(/ENABLE_API_DOCS=1 is not allowed with NODE_ENV=production/);
    expect(
      parseEnv({ ...base, NODE_ENV: 'development', ENABLE_API_DOCS: '1' }).ENABLE_API_DOCS,
    ).toBe(true);
  });

  it('refuses the development token secret in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/TOKEN_SECRET/);
  });

  it('parses APP_EXTRA_ORIGINS into origins, empty by default', () => {
    const dev = { ...base, NODE_ENV: 'development' };
    expect(parseEnv(dev).APP_EXTRA_ORIGINS).toEqual([]);
    expect(parseEnv({ ...dev, APP_EXTRA_ORIGINS: '' }).APP_EXTRA_ORIGINS).toEqual([]);
    expect(
      parseEnv({
        ...dev,
        APP_EXTRA_ORIGINS: 'http://localhost:5173, http://192.168.0.10:5173/',
      }).APP_EXTRA_ORIGINS,
    ).toEqual(['http://localhost:5173', 'http://192.168.0.10:5173']);
  });

  it('refuses an APP_EXTRA_ORIGINS entry that is not an http origin', () => {
    for (const bad of ['http://localhost:5173,not a url', 'ftp://files.example', 'http://x/path']) {
      expect(() => parseEnv({ ...base, NODE_ENV: 'development', APP_EXTRA_ORIGINS: bad })).toThrow(
        /APP_EXTRA_ORIGINS/,
      );
    }
  });

  it('treats a missing NODE_ENV as production', () => {
    const secret = { TOKEN_SECRET: 'x'.repeat(40) };
    expect(() => parseEnv(base)).toThrow(/TOKEN_SECRET/);
    expect(() => parseEnv({ ...base, ...secret, ENABLE_TEST_ROUTES: '1' })).toThrow(
      /ENABLE_TEST_ROUTES/,
    );
    expect(parseEnv({ ...base, ...secret }).NODE_ENV).toBe('production');
  });
});
