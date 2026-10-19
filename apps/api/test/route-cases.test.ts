import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import type { BookingId, DockId } from '../src/db/ids.ts';
import { requireEntitlement, requirePermission, withModule } from '../src/kernel/access.ts';
import { systemClock } from '../src/kernel/clock.ts';
import type { AppEnv } from '../src/kernel/env.ts';
import { ApiError, onError, onNotFound } from '../src/kernel/errors.ts';
import { scoped } from '../src/kernel/scoped.ts';
import { carrierScope, tenantScope } from '../src/kernel/scopes.ts';
import { booking } from '../src/modules/booking/schema.ts';
import { dock } from '../src/modules/core/schema.ts';
import { ownerDb } from './db.ts';
import { checkRouteCase, defineRouteCases, loadRouteCases, type RouteCase } from './route-cases.ts';

const loaded = await loadRouteCases();

describe('route cases of every module', () => {
  it('load from src/modules/**/route-cases.ts', () => {
    expect(Array.isArray(loaded)).toBe(true);
  });
  for (const { file, case: rc } of loaded) {
    it(`${rc.method} ${rc.path} (${file})`, async () => {
      expect(await checkRouteCase(app, rc)).toEqual([]);
    });
  }
});

// The harness must catch the defects it exists for. A toy area, wired like modules/index.ts,
// in a correct version and with one defect each.

type Defect = 'none' | 'bypasses_rls' | 'no_permission' | 'no_entitlement';

function toyApp(defect: Defect) {
  const readDock = async (c: { var: AppEnv['Variables'] }, dockId: DockId) => {
    if (defect === 'bypasses_rls') {
      return (
        await ownerDb()
          .select({ id: dock.id, code: dock.code })
          .from(dock)
          .where(eq(dock.id, dockId))
      )[0];
    }
    const tenantId = c.var.scope.party === 'tenant' ? c.var.scope.tenantId : null;
    if (!tenantId) return undefined;
    const rows = await c.var.db
      .select({ id: dock.id, code: dock.code })
      .from(dock)
      .where(and(eq(dock.id, dockId), eq(dock.tenantId, tenantId)));
    return rows[0];
  };
  const yard = new Hono<AppEnv>().get(
    '/docks/:dockId',
    defect === 'no_permission' ? async (_c, next) => next() : requirePermission('yard.dock'),
    defect === 'no_entitlement'
      ? async (_c, next) => next()
      : requireEntitlement('yard.call_to_dock'),
    async (c) => {
      const row = await readDock(c, c.req.param('dockId') as DockId);
      if (!row) throw new ApiError('not_found');
      return c.json(row);
    },
  );
  const carrier = new Hono<AppEnv>()
    .use(scoped(carrierScope))
    .get('/bookings/:bookingId', requirePermission('booking.view'), async (c) => {
      const id = c.req.param('bookingId') as BookingId;
      const rows =
        defect === 'bypasses_rls'
          ? await ownerDb()
              .select({ id: booking.id, code: booking.code })
              .from(booking)
              .where(eq(booking.id, id))
          : await c.var.db
              .select({ id: booking.id, code: booking.code })
              .from(booking)
              .where(eq(booking.id, id));
      if (!rows[0]) throw new ApiError('not_found');
      return c.json(rows[0]);
    });
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('clock', systemClock);
      await next();
    })
    .route(
      '/api/t/:orgId',
      new Hono<AppEnv>().use(scoped(tenantScope)).route('/yard', withModule('yard', yard)),
    )
    .route('/api/c/:orgId', carrier)
    .onError(onError)
    .notFound(onNotFound);
}

const [dockCase, bookingCase] = defineRouteCases([
  {
    method: 'GET',
    path: '/api/t/:orgId/yard/docks/:dockId',
    as: 'dock_operator',
    permission: 'yard.dock',
    entitlement: 'yard.call_to_dock',
    params: (w) => ({ orgId: w.A.tenantId, dockId: w.A.sites[0].dockIds[0] }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: 'GET',
    path: '/api/c/:orgId/bookings/:bookingId',
    as: 'carrier_user',
    permission: 'booking.view',
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId, bookingId: w.A.bookings.own.id }),
    foreign: 'not_found',
    siteScoped: false,
  },
]) as [RouteCase, RouteCase];

const checks = async (defect: Defect, rc: RouteCase) =>
  [...new Set((await checkRouteCase(toyApp(defect), rc)).map((p) => p.check))].sort();

describe('the harness', () => {
  it('passes correct routes', async () => {
    expect(await checkRouteCase(toyApp('none'), dockCase)).toEqual([]);
    expect(await checkRouteCase(toyApp('none'), bookingCase)).toEqual([]);
  });

  it('fails a handler that reads past RLS without a tenant filter', async () => {
    expect(await checks('bypasses_rls', dockCase)).toEqual(['leak', 'site']);
  });

  it('fails a carrier route that shows another carrier of the same tenant its booking', async () => {
    expect(await checks('bypasses_rls', bookingCase)).toEqual(['leak', 'rival_carrier']);
  });

  it('fails a route without its permission or entitlement check', async () => {
    expect(await checks('no_permission', dockCase)).toEqual(['permission']);
    expect(await checks('no_entitlement', dockCase)).toEqual(['entitlement']);
  });

  it('fails a case whose actor never reaches the handler', async () => {
    const wrongActor = { ...dockCase, as: 'carrier_user' as const };
    expect(await checks('none', wrongActor)).toContain('control');
  });
});
