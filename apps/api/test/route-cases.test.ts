import {
  AccountCredential,
  AccountHarnessDefect,
  ErrorCode,
  Feature,
  ForeignOutcome,
  HttpMethod,
  Module,
  Permission,
  RouteCaseActor,
  RouteHarnessDefect,
  ScopeParty,
} from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import type { BookingId, DockId } from '../src/db/ids.ts';
import { requireEntitlement, requirePermission, withModule } from '../src/kernel/access.ts';
import { testClock } from '../src/kernel/clock.ts';
import type { AppEnv } from '../src/kernel/env.ts';
import { ApiError, onError, onNotFound } from '../src/kernel/errors.ts';
import { scoped } from '../src/kernel/scoped.ts';
import { carrierScope, tenantScope, userScope } from '../src/kernel/scopes.ts';
import { booking } from '../src/modules/booking/schema.ts';
import { dock, membership } from '../src/modules/core/schema.ts';
import { ownerDb } from './db.ts';
import {
  type AccountRouteCase,
  checkAccountCase,
  checkRouteCase,
  defineRouteCases,
  loadAccountCases,
  loadRouteCases,
  type RouteCase,
} from './route-cases.ts';
import { WORLD_NOW } from './world.ts';

const app = createApp({ clock: testClock(WORLD_NOW), testRoutes: true });
const loaded = await loadRouteCases();
const accountLoaded = await loadAccountCases();

describe('route cases of every module', () => {
  it('load from src/modules/**/route-cases.ts', () => {
    expect(Array.isArray(loaded)).toBe(true);
  });
  for (const { file, case: rc } of loaded) {
    it(`${rc.method} ${rc.path} (${file})`, async () => {
      expect(await checkRouteCase(app, rc)).toEqual([]);
    });
  }
  for (const { file, case: ac } of accountLoaded) {
    it(`${ac.method} ${ac.path} (${file}, account)`, async () => {
      expect(await checkAccountCase(app, ac)).toEqual([]);
    });
  }
});

// The account harness against a toy /api/me: correct, without the session check, reading every
// membership past the user filter, and accepting a driver cookie as a session.

function toyAccountApp(defect: AccountHarnessDefect) {
  const resolve = async (c: Context<AppEnv>) => {
    if (
      defect === AccountHarnessDefect.driver_is_user &&
      c.req.header('Cookie')?.startsWith('rf_driver=')
    ) {
      return { party: 'anonymous' } as const;
    }
    if (defect === AccountHarnessDefect.no_session) return { party: 'anonymous' } as const;
    return userScope(c);
  };
  const me = new Hono<AppEnv>().use(scoped(resolve)).get('/', async (c) => {
    const { scope } = c.var;
    const rows = await ownerDb()
      .select({ orgId: membership.orgId, userId: membership.userId })
      .from(membership);
    const visible = rows.filter(
      (r) =>
        defect === AccountHarnessDefect.all_users ||
        (scope.party === ScopeParty.user && r.userId === scope.userId),
    );
    return c.json({ orgs: visible.map((r) => r.orgId) });
  });
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('clock', testClock(WORLD_NOW));
      await next();
    })
    .route('/api/me', me)
    .onError(onError)
    .notFound(onNotFound);
}

const meCase: AccountRouteCase = {
  method: HttpMethod.GET,
  path: '/api/me',
  credential: AccountCredential.session,
  arrange: async (w) => ({ actor: w.A.users.dispatcher }),
};

const accountChecks = async (defect: AccountHarnessDefect) =>
  [...new Set((await checkAccountCase(toyAccountApp(defect), meCase)).map((p) => p.check))].sort();

describe('the account harness', () => {
  it('passes a correct session route', async () => {
    expect(await checkAccountCase(toyAccountApp(AccountHarnessDefect.none), meCase)).toEqual([]);
  });

  it('fails a route that serves anonymous callers', async () => {
    expect(await accountChecks(AccountHarnessDefect.no_session)).toContain('anonymous');
  });

  it('fails a route that treats a driver cookie as a session', async () => {
    expect(await accountChecks(AccountHarnessDefect.driver_is_user)).toEqual(['wrong_party']);
  });

  it('fails a route that shows other users their memberships', async () => {
    expect(await accountChecks(AccountHarnessDefect.all_users)).toContain('foreign_org');
  });
});

// The harness must catch the defects it exists for. A toy area, wired like modules/index.ts,
// in a correct version and with one defect each.

function toyApp(defect: RouteHarnessDefect) {
  const readDock = async (c: { var: AppEnv['Variables'] }, dockId: DockId) => {
    if (defect === RouteHarnessDefect.bypasses_rls) {
      return (
        await ownerDb()
          .select({ id: dock.id, code: dock.code })
          .from(dock)
          .where(eq(dock.id, dockId))
      )[0];
    }
    const tenantId = c.var.scope.party === ScopeParty.tenant ? c.var.scope.tenantId : null;
    if (!tenantId) return undefined;
    const rows = await c.var.db
      .select({ id: dock.id, code: dock.code })
      .from(dock)
      .where(and(eq(dock.id, dockId), eq(dock.tenantId, tenantId)));
    return rows[0];
  };
  const yard = new Hono<AppEnv>().get(
    '/docks/:dockId',
    defect === RouteHarnessDefect.no_permission
      ? async (_c, next) => next()
      : requirePermission(Permission.yard.dock),
    defect === RouteHarnessDefect.no_entitlement
      ? async (_c, next) => next()
      : requireEntitlement(Feature.yard.call_to_dock),
    async (c) => {
      const row = await readDock(c, c.req.param('dockId') as DockId);
      if (!row) throw new ApiError(ErrorCode.not_found);
      return c.json(row);
    },
  );
  const carrier = new Hono<AppEnv>()
    .use(scoped(carrierScope))
    .get('/bookings/:bookingId', requirePermission(Permission.booking.view), async (c) => {
      const id = c.req.param('bookingId') as BookingId;
      const rows =
        defect === RouteHarnessDefect.bypasses_rls
          ? await ownerDb()
              .select({ id: booking.id, code: booking.code })
              .from(booking)
              .where(eq(booking.id, id))
          : await c.var.db
              .select({ id: booking.id, code: booking.code })
              .from(booking)
              .where(eq(booking.id, id));
      if (!rows[0]) throw new ApiError(ErrorCode.not_found);
      return c.json(rows[0]);
    });
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('clock', testClock(WORLD_NOW));
      await next();
    })
    .route(
      '/api/t/:orgId',
      new Hono<AppEnv>().use(scoped(tenantScope)).route('/yard', withModule(Module.yard, yard)),
    )
    .route('/api/c/:orgId', carrier)
    .onError(onError)
    .notFound(onNotFound);
}

const [dockCase, bookingCase] = defineRouteCases([
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/yard/docks/:dockId',
    as: RouteCaseActor.dock_operator,
    permission: Permission.yard.dock,
    entitlement: Feature.yard.call_to_dock,
    params: (w) => ({ orgId: w.A.tenantId, dockId: w.A.sites[0].dockIds[0] }),
    foreign: ForeignOutcome.not_found,
    siteScoped: true,
  },
  {
    method: HttpMethod.GET,
    path: '/api/c/:orgId/bookings/:bookingId',
    as: RouteCaseActor.carrier_user,
    permission: Permission.booking.view,
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId, bookingId: w.A.bookings.own.id }),
    foreign: ForeignOutcome.not_found,
    siteScoped: false,
  },
]) as [RouteCase, RouteCase];

const checks = async (defect: RouteHarnessDefect, rc: RouteCase) =>
  [...new Set((await checkRouteCase(toyApp(defect), rc)).map((p) => p.check))].sort();

describe('the harness', () => {
  it('passes correct routes', async () => {
    expect(await checkRouteCase(toyApp(RouteHarnessDefect.none), dockCase)).toEqual([]);
    expect(await checkRouteCase(toyApp(RouteHarnessDefect.none), bookingCase)).toEqual([]);
  });

  it('fails a handler that reads past RLS without a tenant filter', async () => {
    expect(await checks(RouteHarnessDefect.bypasses_rls, dockCase)).toEqual(['leak', 'site']);
  });

  it('fails a carrier route that shows another carrier of the same tenant its booking', async () => {
    expect(await checks(RouteHarnessDefect.bypasses_rls, bookingCase)).toEqual([
      'leak',
      'rival_carrier',
    ]);
  });

  it('fails a route without its permission or entitlement check', async () => {
    expect(await checks(RouteHarnessDefect.no_permission, dockCase)).toEqual(['permission']);
    expect(await checks(RouteHarnessDefect.no_entitlement, dockCase)).toEqual(['entitlement']);
  });

  it('fails a case that leaves out the entitlement its route requires', async () => {
    const undeclared = { ...dockCase, entitlement: null };
    expect(await checkRouteCase(toyApp(RouteHarnessDefect.none), undeclared)).toEqual([
      {
        check: 'entitlement',
        detail: expect.stringContaining('yard.call_to_dock'),
      },
    ]);
  });

  it('fails a case whose actor never reaches the handler', async () => {
    const wrongActor = { ...dockCase, as: 'carrier_user' as const };
    expect(await checks(RouteHarnessDefect.none, wrongActor)).toContain('control');
  });
});
