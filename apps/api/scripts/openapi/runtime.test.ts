import { HttpMethod, Permission, StoryId } from '@rampflow/shared/values';
import { Hono, type MiddlewareHandler } from 'hono';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { createApp } from '../../src/app.ts';
import { type Guard, op, register } from '../../src/kernel/describe.ts';
import { validate } from '../../src/kernel/validate.ts';
import { GeneratorError } from './model.ts';
import { collectEndpoints, partyOf, patternMatches } from './runtime.ts';

/** A guard that only marks the response, so the test can see which guards Hono ran. */
const marker = (guard: Guard & { kind: 'permission' }): MiddlewareHandler =>
  register<MiddlewareHandler>(
    async (c, next) => {
      await next();
      c.res.headers.append('x-guards', guard.key);
    },
    { kind: 'guard', guard },
  );

const meta = (id: `${string}.${string}.${string}`) =>
  op({ id, stories: [StoryId.MD_03], description: 'Toy.', responses: {} });

const staff = marker({ kind: 'permission', key: Permission.core.manage_staff });
const view = marker({ kind: 'permission', key: Permission.booking.view });

const Body = z.object({ name: z.string() });

// Two routers on one prefix, like the two safety routers under /safety.
const first = new Hono().use(staff).get('/a', meta('toy.first.getA'), (c) => c.json({}, 200));
const second = new Hono()
  .get('/b', meta('toy.second.getB'), view, (c) => c.json({}, 200))
  .post('/b', meta('toy.second.createB'), validate('json', Body), (c) => c.json({}, 201));
const toy = new Hono().route('/api/t/:orgId/s', new Hono().route('/', first).route('/', second));

describe('collectEndpoints', () => {
  it('gives each endpoint exactly the guards Hono runs for it, a sibling .use() included', async () => {
    const byKey = Object.fromEntries(
      collectEndpoints(toy.routes).map((e) => [`${e.method} ${e.path}`, e.guards]),
    );
    expect(byKey).toEqual({
      'GET /api/t/:orgId/s/a': [{ kind: 'permission', key: 'core.manage_staff' }],
      'GET /api/t/:orgId/s/b': [
        { kind: 'permission', key: 'core.manage_staff' },
        { kind: 'permission', key: 'booking.view' },
      ],
      'POST /api/t/:orgId/s/b': [{ kind: 'permission', key: 'core.manage_staff' }],
    });
    const ran = async (method: string, path: string) => {
      const body = method === 'GET' ? undefined : '{"name":"x"}';
      const headers = { 'Content-Type': 'application/json' };
      const res = await toy.request(path, { method, body, headers });
      return res.headers.get('x-guards')?.split(', ').sort();
    };
    expect(await ran('GET', '/api/t/1/s/a')).toEqual(['core.manage_staff']);
    expect(await ran('GET', '/api/t/1/s/b')).toEqual(['booking.view', 'core.manage_staff']);
    expect(await ran('POST', '/api/t/1/s/b')).toEqual(['core.manage_staff']);
  });

  it('joins the op() metadata, the party and the validators', () => {
    const post = collectEndpoints(toy.routes).find((e) => e.method === HttpMethod.POST);
    expect(post).toMatchObject({
      path: '/api/t/:orgId/s/b',
      party: 'tenant',
      meta: { id: 'toy.second.createB' },
      validators: { json: Body },
    });
  });

  it('fails on a route without op(), a duplicate id and a path outside every party', () => {
    const bad = new Hono()
      .get('/api/t/:orgId/x', (c) => c.json({}, 200))
      .get('/api/t/:orgId/y', meta('toy.dup.get'), (c) => c.json({}, 200))
      .get('/api/me/z', meta('toy.dup.get'), (c) => c.json({}, 200))
      .get('/api/elsewhere', meta('toy.other.get'), (c) => c.json({}, 200));
    expect(() => collectEndpoints(bad.routes)).toThrow(GeneratorError);
    try {
      collectEndpoints(bad.routes);
    } catch (err) {
      expect((err as GeneratorError).problems).toEqual([
        'GET /api/t/:orgId/x: needs exactly one op(), has 0',
        'GET /api/elsewhere: matches no party prefix',
        'operation id toy.dup.get is used by GET /api/t/:orgId/y, GET /api/me/z',
      ]);
    }
  });

  it('describes every route of the app once and leaves out the test and docs routes', () => {
    const app = createApp({ testRoutes: true, apiDocs: true });
    const paths = collectEndpoints(app.routes).map((e) => e.path);
    const excluded = ['/api/test', '/api/docs', '/api/openapi.json'];
    expect(paths.filter((p) => excluded.some((x) => p.startsWith(x)))).toEqual([]);
    const routes = new Set(
      app.routes
        .filter((r) => r.method !== 'ALL' && !excluded.some((x) => r.path.startsWith(x)))
        .map((r) => `${r.method} ${r.path}`),
    );
    expect(paths.length).toBe(routes.size);
  });
});

describe('partyOf', () => {
  it('maps every route of the app to a party', () => {
    const unmatched = createApp({ testRoutes: false })
      .routes.filter((r) => r.method !== 'ALL' && partyOf(r.path) === null)
      .map((r) => `${r.method} ${r.path}`);
    expect(unmatched).toEqual([]);
  });

  it('prefers the more specific prefix', () => {
    expect(partyOf('/api/auth/logout')).toBe('user');
    expect(partyOf('/api/auth/login')).toBe('anonymous');
    expect(partyOf('/api/c/:orgId/at/:tenantId/bookings')).toBe('carrier_at_tenant');
    expect(partyOf('/api/c/:orgId/bookings')).toBe('carrier');
    expect(partyOf('/api/testing')).toBe(null);
  });
});

describe('patternMatches', () => {
  it('matches the way Hono applies middleware', () => {
    expect(patternMatches('/api/t/:orgId/safety/*', '/api/t/:orgId/safety')).toBe(true);
    expect(patternMatches('/api/t/:orgId/safety/*', '/api/t/:orgId/safety/x/:id')).toBe(true);
    expect(patternMatches('/api/t/:orgId/safety/*', '/api/t/:orgId/yard/x')).toBe(false);
    expect(patternMatches('/api/t/:orgId/x', '/api/t/:orgId/x')).toBe(true);
    expect(patternMatches('/api/t/:orgId/x', '/api/t/:orgId/x/y')).toBe(false);
  });
});
