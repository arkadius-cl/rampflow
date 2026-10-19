import { globSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  catalog,
  type ImplementedFeatureKey,
  type PermissionKey,
  permissionsFor,
  type Role,
} from '@rampflow/shared';
import { and, eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { type TenantId, type UserId, wrapJson } from '../src/db/ids.ts';
import { entitlementOverride } from '../src/modules/core/schema.ts';
import { type OwnerDb, ownerDb } from './db.ts';
import { type Actor, as } from './http.ts';
import { world as seedWorld, type World, type WorldSide } from './world.ts';

// The leak harness of ADR-0002. Every route under /api/t, /api/c, /api/platform and /api/driver
// has a case in a route-cases.ts next to its router; route-coverage.test.ts enforces that, and
// test/route-cases.test.ts runs every case through checkRouteCase.

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteCase {
  method: Method;
  /** The Hono pattern as in `app.routes`, for example `/api/t/:orgId/yard/bookings/:bookingId/call`. */
  path: string;
  /** A role that may call it, or a driver holding the link of `A.bookings.own`. */
  as: Role | 'driver';
  permission: PermissionKey | 'member' | 'driver';
  /** A feature the route requires beyond its module's gate. */
  entitlement: ImplementedFeatureKey | null;
  /** Path parameters from world A. `orgId` (and `tenantId` under /at/) are swapped per check. */
  params: (world: World) => Record<string, string>;
  body?: (world: World) => unknown;
  /** Module fixtures in worlds A and B, written as the owner. */
  setup?: (world: World, db: OwnerDb) => Promise<void>;
  /** What world B (or a rival carrier, or a foreign site) gets: 404, or 200 without A's data. */
  foreign: 'not_found' | 'empty';
  /** A gate or dock operator of the tenant's other site gets 404 (TN-01). */
  siteScoped: boolean;
}

export function defineRouteCases(cases: readonly RouteCase[]): readonly RouteCase[] {
  return cases;
}

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** Every case of every `src/modules/**\/route-cases.ts`, with the file it came from. */
export async function loadRouteCases(): Promise<{ file: string; case: RouteCase }[]> {
  const out: { file: string; case: RouteCase }[] = [];
  for (const file of globSync('modules/**/route-cases.ts', { cwd: SRC }).sort()) {
    const mod: { cases?: readonly RouteCase[] } = await import(pathToFileURL(join(SRC, file)).href);
    if (!mod.cases) throw new Error(`${file} must export \`cases\` from defineRouteCases`);
    for (const c of mod.cases) out.push({ file, case: c });
  }
  return out;
}

export const routeKey = (method: string, path: string) => `${method} ${path}`;

/** Prefixes whose every route needs a case (ADR-0002, "Leak tests"). */
const GUARDED = /^\/api\/(t|c|platform|driver)(\/|$)/;

export interface Coverage {
  /** Routes without a case. */
  uncovered: string[];
  /** Cases that name no route of the app (renamed or deleted routes). */
  stale: string[];
}

/** Compares `app.routes` with the route cases. Middleware entries (`ALL`) are not routes. */
export function coverage(
  routes: readonly { method: string; path: string }[],
  cases: readonly Pick<RouteCase, 'method' | 'path'>[],
): Coverage {
  const handlers = new Set(
    routes
      .filter((r) => r.method !== 'ALL' && GUARDED.test(r.path))
      .map((r) => routeKey(r.method, r.path)),
  );
  const covered = new Set(cases.map((c) => routeKey(c.method, c.path)));
  return {
    uncovered: [...handlers].filter((k) => !covered.has(k)).sort(),
    stale: [...covered].filter((k) => !handlers.has(k)).sort(),
  };
}

const TENANT_ROLES: readonly Role[] = [
  'dock_operator',
  'gate_operator',
  'dispatcher',
  'tenant_admin',
];
const CARRIER_ROLES: readonly Role[] = ['carrier_user', 'carrier_admin'];

function actorOf(side: WorldSide, w: World, role: Role | 'driver'): Actor {
  switch (role) {
    case 'driver':
      return side.bookings.own;
    case 'platform_admin':
      return w.platformAdmin;
    default:
      return side.users[role];
  }
}

function rivalOf(side: WorldSide, role: Role): Actor {
  return role === 'carrier_admin' ? side.users.rival_admin : side.users.rival_user;
}

function fill(pattern: string, params: Record<string, string>): string {
  return pattern.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`No value for :${name} in ${pattern}`);
    return encodeURIComponent(value);
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every id and booking code of one world side, the values a foreign caller must never see. */
function secretsOf(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string' && (UUID.test(value) || /^[0-9A-F]{8}$/.test(value)))
    out.add(value);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) secretsOf(v, out);
  return out;
}

export interface Problem {
  check:
    | 'control'
    | 'leak'
    | 'foreign_org'
    | 'rival_carrier'
    | 'site'
    | 'permission'
    | 'entitlement';
  detail: string;
}

async function expectForeign(
  res: Response,
  foreign: RouteCase['foreign'],
  secrets: ReadonlySet<string>,
): Promise<string | null> {
  const text = await res.text();
  const leaked = [...secrets].filter((s) => text.includes(s));
  if (leaked.length > 0) return `${res.status} body contains ${leaked.slice(0, 3).join(', ')}`;
  if (res.status === 404) return null;
  if (foreign === 'empty' && res.status === 200) return null;
  return `expected ${foreign === 'empty' ? '404 or 200 without foreign data' : '404'}, got ${res.status} ${text.slice(0, 200)}`;
}

async function expectError(res: Response, status: number, code: string): Promise<string | null> {
  const text = await res.text();
  if (res.status !== status)
    return `expected ${status} ${code}, got ${res.status} ${text.slice(0, 200)}`;
  const body = JSON.parse(text) as { error?: { code?: string } };
  return body.error?.code === code ? null : `expected code ${code}, got ${text.slice(0, 200)}`;
}

async function withOverride<T>(
  tenantId: TenantId,
  key: string,
  updatedBy: UserId,
  fn: () => Promise<T>,
): Promise<T> {
  const o = ownerDb();
  await o.insert(entitlementOverride).values({ tenantId, key, value: wrapJson(false), updatedBy });
  try {
    return await fn();
  } finally {
    await o
      .delete(entitlementOverride)
      .where(and(eq(entitlementOverride.tenantId, tenantId), eq(entitlementOverride.key, key)));
  }
}

/**
 * Runs the checks of ADR-0002 for one case and returns what failed. The control call as A's
 * actor runs last and must succeed, so a case that never reaches its handler cannot pass.
 */
export async function checkRouteCase(
  app: Pick<Hono, 'request'>,
  rc: RouteCase,
): Promise<Problem[]> {
  const w = await seedWorld();
  await rc.setup?.(w, ownerDb());
  const { A, B } = w;
  const problems: Problem[] = [];
  const params = rc.params(w);
  const body = rc.body?.(w);
  const call = (actor: Actor, p: Record<string, string>) =>
    as(app, actor).request(rc.method, fill(rc.path, p), { body });
  const secretsA = secretsOf(A);
  const role = rc.as;
  const party =
    role === 'driver'
      ? 'driver'
      : TENANT_ROLES.includes(role)
        ? 'tenant'
        : CARRIER_ROLES.includes(role)
          ? 'carrier'
          : 'platform';
  const report = (check: Problem['check'], detail: string | null) => {
    if (detail) problems.push({ check, detail });
  };

  // 1. Foreign tenant, carrier or booking: B's actor with A's ids, then inside B's own org.
  // Platform admins see every org by design (ADR-0002); their routes have no foreign party.
  if (party !== 'platform') {
    report(
      'foreign_org',
      await expectForeign(await call(actorOf(B, w, role), params), rc.foreign, secretsA),
    );
  }
  if (party === 'tenant' || party === 'carrier') {
    const own = {
      ...params,
      orgId: party === 'tenant' ? B.tenantId : B.carrierId,
      ...(rc.path.includes(':tenantId') ? { tenantId: B.tenantId } : {}),
    };
    report('leak', await expectForeign(await call(actorOf(B, w, role), own), rc.foreign, secretsA));
  }

  // 1b. A second carrier linked to the same tenant sees none of the first carrier's rows.
  if (party === 'carrier') {
    const rivalSecrets = secretsOf([A.carrierId, A.bookings.own, A.bookings.otherSite]);
    const rival = { ...params, orgId: A.rivalCarrierId };
    report(
      'rival_carrier',
      await expectForeign(await call(rivalOf(A, role as Role), rival), rc.foreign, rivalSecrets),
    );
  }
  if (party === 'driver') {
    const rivalSecrets = secretsOf([A.bookings.own.id, A.bookings.own.code]);
    report(
      'rival_carrier',
      await expectForeign(await call(A.bookings.rival, params), rc.foreign, rivalSecrets),
    );
  }

  // 2. Foreign site: an operator limited to the other site of the same tenant.
  if (rc.siteScoped && party === 'tenant') {
    const operator = role === 'dock_operator' ? 'dock_operator' : 'gate_operator';
    const holds =
      rc.permission === 'member' ||
      permissionsFor(catalog, operator).has(rc.permission as PermissionKey);
    const res = await call(A.users[`${operator}_other_site`], params);
    report(
      'site',
      holds
        ? await expectForeign(res, 'not_found', secretsOf(A.sites[0]))
        : await expectError(res, 403, 'forbidden'),
    );
  }

  // 3. Missing permission: the highest role of the same party that lacks it.
  if (rc.permission !== 'member' && rc.permission !== 'driver') {
    const roles = party === 'tenant' ? TENANT_ROLES : party === 'carrier' ? CARRIER_ROLES : [];
    const lacking = roles
      .filter((r) => !permissionsFor(catalog, r).has(rc.permission as PermissionKey))
      .at(-1);
    if (lacking)
      report(
        'permission',
        await expectError(await call(actorOf(A, w, lacking), params), 403, 'forbidden'),
      );
  }

  // 4. Entitlement off: the route's feature, and the feature that enables its module.
  const module = rc.permission.includes('.')
    ? catalog.find((m) => rc.permission.startsWith(`${m.id}.`))
    : undefined;
  const features = [rc.entitlement, module?.enabledBy ?? null].filter((f) => f !== null);
  if (party !== 'platform') {
    for (const feature of features) {
      const res = await withOverride(A.tenantId, feature, w.platformAdmin.id, () =>
        call(actorOf(A, w, role), params),
      );
      report('entitlement', await expectError(res, 403, 'entitlement_required'));
    }
  }

  // Control: the case's own actor reaches the handler.
  const res = await call(actorOf(A, w, role), params);
  if (res.status >= 400)
    report('control', `${role} got ${res.status} ${(await res.text()).slice(0, 200)}`);
  return problems;
}
