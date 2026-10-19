import { randomBytes } from 'node:crypto';
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
  /** Query parameters from world A, sent unchanged with every check. */
  query?: (world: World) => Record<string, string>;
  body?: (world: World) => unknown;
  /** Module fixtures in worlds A and B, written as the owner. */
  setup?: (world: World, db: OwnerDb) => Promise<void>;
  /** What world B (or a rival carrier, or a foreign site) gets: 404, or 2xx without A's data. */
  foreign: 'not_found' | 'empty';
  /** A gate or dock operator of the tenant's other site gets 404 (TN-01). */
  siteScoped: boolean;
}

export function defineRouteCases(cases: readonly RouteCase[]): readonly RouteCase[] {
  return cases;
}

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/**
 * A route outside the org areas: `/api/me`, `/api/auth/*`, `/api/public/*`. These routes take
 * no org id, so the harness checks who may call them and that they reveal no other world.
 */
export interface AccountRouteCase {
  method: Method;
  path: string;
  /**
   * `session`: a signed-in user's `rf_session` (party `user`).
   * `token`: an emailed token in the body's `token` field (party `token`).
   * `none`: open to anyone, for example sign-in and link requests.
   */
  credential: 'session' | 'token' | 'none';
  /** A token route whose token works once: a second control call must answer 401. */
  singleUse?: boolean;
  /**
   * Writes the case's fixtures and returns the control request, which must succeed. A session
   * case acts as a user of world A, so the harness can call as their counterpart in world B.
   * A token case also returns `otherToken`: a valid token of another purpose for the same
   * person (a reset token for a magic-link route, ...), which the route must refuse.
   * `params` fills path parameters, for example the `:slug` of a public link.
   */
  arrange: (
    world: World,
    db: OwnerDb,
  ) => Promise<{
    actor: Actor;
    body?: unknown;
    otherToken?: string;
    params?: Record<string, string>;
  }>;
}

export function defineAccountCases(
  cases: readonly AccountRouteCase[],
): readonly AccountRouteCase[] {
  return cases;
}

interface CaseModule {
  cases?: readonly RouteCase[];
  accountCases?: readonly AccountRouteCase[];
}

async function caseModules(): Promise<{ file: string; mod: CaseModule }[]> {
  const out: { file: string; mod: CaseModule }[] = [];
  for (const file of globSync('modules/**/route-cases.ts', { cwd: SRC }).sort()) {
    const mod: CaseModule = await import(pathToFileURL(join(SRC, file)).href);
    if (!mod.cases && !mod.accountCases) {
      throw new Error(`${file} must export \`cases\` or \`accountCases\``);
    }
    out.push({ file, mod });
  }
  return out;
}

/** Every case of every `src/modules/**\/route-cases.ts`, with the file it came from. */
export async function loadRouteCases(): Promise<{ file: string; case: RouteCase }[]> {
  return (await caseModules()).flatMap(({ file, mod }) =>
    (mod.cases ?? []).map((c) => ({ file, case: c })),
  );
}

export async function loadAccountCases(): Promise<{ file: string; case: AccountRouteCase }[]> {
  return (await caseModules()).flatMap(({ file, mod }) =>
    (mod.accountCases ?? []).map((c) => ({ file, case: c })),
  );
}

export const routeKey = (method: string, path: string) => `${method} ${path}`;

/** Prefixes whose every route needs a case (ADR-0002, "Leak tests"). */
const GUARDED = /^\/api\/(t|c|platform|driver)(\/|$)/;
/** Prefixes whose every route needs an account case. */
const ACCOUNT = /^\/api\/(me|auth|public)(\/|$)/;

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
  guarded: RegExp = GUARDED,
): Coverage {
  const handlers = new Set(
    routes
      .filter((r) => r.method !== 'ALL' && guarded.test(r.path))
      .map((r) => routeKey(r.method, r.path)),
  );
  const covered = new Set(cases.map((c) => routeKey(c.method, c.path)));
  return {
    uncovered: [...handlers].filter((k) => !covered.has(k)).sort(),
    stale: [...covered].filter((k) => !handlers.has(k)).sort(),
  };
}

/** `coverage` of `/api/me`, `/api/auth` and `/api/public` against the account cases. */
export const accountCoverage = (
  routes: readonly { method: string; path: string }[],
  cases: readonly Pick<AccountRouteCase, 'method' | 'path'>[],
) => coverage(routes, cases, ACCOUNT);

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
  // A create in the caller's own org answers 201 or 204; only A's data would be a leak.
  if (foreign === 'empty' && res.status >= 200 && res.status < 300) return null;
  return `expected ${foreign === 'empty' ? '404 or 2xx without foreign data' : '404'}, got ${res.status} ${text.slice(0, 200)}`;
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
  const query = rc.query ? `?${new URLSearchParams(rc.query(w))}` : '';
  const call = (actor: Actor, p: Record<string, string>) =>
    as(app, actor).request(rc.method, `${fill(rc.path, p)}${query}`, { body });
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

export interface AccountProblem {
  check: 'anonymous' | 'wrong_party' | 'foreign_org' | 'reuse' | 'control';
  detail: string;
}

/** The user of world B who holds the same key as `actor` in world A. */
function counterpart(w: World, actor: Actor): Actor {
  if (!actor || !('sessionToken' in actor)) return actor;
  const keys = Object.keys(w.A.users) as (keyof WorldSide['users'])[];
  const key = keys.find((k) => w.A.users[k].id === actor.id);
  if (!key) throw new Error('A session case acts as a user of world A');
  return w.B.users[key];
}

const leakIn = (text: string, secrets: ReadonlySet<string>) =>
  [...secrets].filter((s) => text.includes(s)).slice(0, 3);

/**
 * The checks for a route outside the org areas. A session route refuses an anonymous caller and
 * a driver cookie with 401, and shows B's counterpart nothing of world A. A token route refuses
 * an unknown token, a driver token and a token of another purpose with 401, even with a session,
 * and a single-use token the second time. Every control call succeeds and shows nothing of
 * world B.
 */
export async function checkAccountCase(
  app: Pick<Hono, 'request'>,
  ac: AccountRouteCase,
): Promise<AccountProblem[]> {
  const w = await seedWorld();
  const { actor, body, otherToken, params } = await ac.arrange(w, ownerDb());
  const problems: AccountProblem[] = [];
  const report = (check: AccountProblem['check'], detail: string | null) => {
    if (detail) problems.push({ check, detail });
  };
  const call = (who: Actor, b: unknown = body) =>
    as(app, who).request(ac.method, fill(ac.path, params ?? {}), { body: b });

  if (ac.credential === 'session') {
    report('anonymous', await expectError(await call(null), 401, 'unauthorized'));
    report('wrong_party', await expectError(await call(w.A.bookings.own), 401, 'unauthorized'));
    const res = await call(counterpart(w, actor));
    const text = await res.text();
    const leaked = leakIn(text, secretsOf(w.A));
    if (res.status >= 500 || leaked.length > 0) {
      report('foreign_org', `${res.status} ${leaked.length ? `leaks ${leaked.join(', ')}` : text}`);
    }
  }
  if (ac.credential === 'token') {
    const withToken = (token: string) => ({ ...(body as object), token });
    const unknown = randomBytes(32).toString('base64url');
    report(
      'anonymous',
      await expectError(await call(null, withToken(unknown)), 401, 'unauthorized'),
    );
    report(
      'wrong_party',
      await expectError(
        await call(w.A.users.tenant_admin, withToken(w.A.bookings.own.driverToken)),
        401,
        'unauthorized',
      ),
    );
    if (!otherToken) report('wrong_party', 'arrange returns no otherToken of another purpose');
    else {
      report(
        'wrong_party',
        await expectError(await call(null, withToken(otherToken)), 401, 'unauthorized'),
      );
    }
  }

  const res = await call(actor);
  const text = await res.text();
  if (res.status >= 400) report('control', `got ${res.status} ${text.slice(0, 200)}`);
  const leaked = leakIn(text, secretsOf(w.B));
  if (leaked.length > 0) report('foreign_org', `control answer leaks ${leaked.join(', ')}`);
  if (ac.credential === 'token' && (ac.singleUse ?? true)) {
    report('reuse', await expectError(await call(actor), 401, 'unauthorized'));
  }
  return problems;
}
