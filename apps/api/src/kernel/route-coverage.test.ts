import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  accountCoverage,
  coverage,
  defineRouteCases,
  loadAccountCases,
  loadRouteCases,
} from '../../test/route-cases.ts';
import { app, createApp } from '../app.ts';
import type { AppEnv } from './env.ts';

describe('route coverage', () => {
  // The docs routes sit outside every guarded prefix, like /api/test.
  const withDocs = createApp({ apiDocs: true });

  it('every guarded route of the app has a route case, and every case names a route', async () => {
    const cases = (await loadRouteCases()).map((l) => l.case);
    expect(coverage(app.routes, cases)).toEqual({ uncovered: [], stale: [] });
    expect(coverage(withDocs.routes, cases)).toEqual({ uncovered: [], stale: [] });
  });

  it('every /api/me, /api/auth and /api/public route has an account case', async () => {
    const cases = (await loadAccountCases()).map((l) => l.case);
    expect(accountCoverage(app.routes, cases)).toEqual({ uncovered: [], stale: [] });
    expect(accountCoverage(withDocs.routes, cases)).toEqual({ uncovered: [], stale: [] });
  });

  it('fails on a toy account route without a case', () => {
    const toy = new Hono().get('/api/me', (c) => c.json({})).post('/api/health', (c) => c.text(''));
    expect(accountCoverage(toy.routes, [])).toEqual({ uncovered: ['GET /api/me'], stale: [] });
  });

  it('fails on a toy app with a route that has no case', () => {
    const toy = new Hono<AppEnv>().route(
      '/api/t/:orgId',
      new Hono<AppEnv>()
        .use(async (_c, next) => next())
        .get('/toys', (c) => c.json({ items: [] }))
        .post('/toys', (c) => c.json({}, 201)),
    );
    const cases = defineRouteCases([
      {
        method: 'GET',
        path: '/api/t/:orgId/toys',
        as: 'dispatcher',
        permission: 'member',
        entitlement: null,
        params: (w) => ({ orgId: w.A.tenantId }),
        foreign: 'not_found',
        siteScoped: false,
      },
      {
        method: 'DELETE',
        path: '/api/t/:orgId/toys/:toyId',
        as: 'dispatcher',
        permission: 'member',
        entitlement: null,
        params: (w) => ({ orgId: w.A.tenantId, toyId: w.A.sites[0].id }),
        foreign: 'not_found',
        siteScoped: false,
      },
    ]);
    expect(coverage(toy.routes, cases)).toEqual({
      uncovered: ['POST /api/t/:orgId/toys'],
      stale: ['DELETE /api/t/:orgId/toys/:toyId'],
    });
  });

  it('ignores the allowlisted prefixes', () => {
    const toy = new Hono()
      .get('/api/health', (c) => c.text('ok'))
      .post('/api/auth/login', (c) => c.text('ok'))
      .post('/api/test/seed', (c) => c.text('ok'))
      .get('/api/docs/:file', (c) => c.text('ok'))
      .get('/api/openapi.json', (c) => c.json({}));
    expect(coverage(toy.routes, [])).toEqual({ uncovered: [], stale: [] });
  });
});
