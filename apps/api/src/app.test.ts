import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { as, TEST_ORIGIN } from '../test/http.ts';
import { app, createApp } from './app.ts';
import { parseEnv } from './kernel/env.ts';
import { onError } from './kernel/errors.ts';
import { requireSameOrigin } from './kernel/origin.ts';
import { onInvalid } from './kernel/validate.ts';

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
  const echo = () =>
    new Hono()
      .use(requireSameOrigin(TEST_ORIGIN))
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
    expect((await as(echo(), null).get('/x', { origin: null })).status).toBe(200);
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

  it('refuses the development token secret in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/TOKEN_SECRET/);
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
