import { randomUUID } from 'node:crypto';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { ConflictReason, ErrorCode, Role, ScopeParty } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../test/db.ts';
import { as } from '../../test/http.ts';
import { WORLD_NOW, type World, world } from '../../test/world.ts';
import { appUser, hall } from '../modules/core/schema.ts';
import { testClock } from './clock.ts';
import type { AppEnv } from './env.ts';
import { ApiError, onError, onNotFound } from './errors.ts';
import { scoped } from './scoped.ts';
import { carrierScope, driverScope, tenantScope } from './scopes.ts';

let w: World;
beforeAll(async () => {
  w = await world();
});

/** A toy app wired like modules/index.ts: clock, one scoped() per area, the error envelope. */
function toyApp(clock = testClock(WORLD_NOW)) {
  const writeHall = async (c: { var: AppEnv['Variables'] }, name: string) =>
    c.var.db.insert(hall).values({ tenantId: w.A.tenantId, siteId: w.A.sites[0].id, name });
  const tenant = new Hono<AppEnv>()
    .use(scoped(tenantScope))
    .post('/throws', async (c) => {
      await writeHall(c, c.req.header('X-Name') ?? '');
      throw new ApiError(ErrorCode.conflict, 'after a write', {
        reason: ConflictReason.stale_version,
      });
    })
    .post('/returns-409', async (c) => {
      await writeHall(c, c.req.header('X-Name') ?? '');
      return c.json({ error: { code: ErrorCode.conflict } }, 409);
    })
    .post('/commits', async (c) => {
      await writeHall(c, c.req.header('X-Name') ?? '');
      return c.json({ ok: true }, 201);
    })
    .get('/scope', (c) => c.json(c.var.scope));
  const carrier = new Hono<AppEnv>()
    .use(scoped(carrierScope))
    .get('/scope', (c) => c.json(c.var.scope))
    .get('/at/:tenantId/scope', (c) => c.json(c.var.scope));
  const driver = new Hono<AppEnv>()
    .use(scoped(driverScope))
    .get('/scope', (c) => c.json(c.var.scope));
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('clock', clock);
      await next();
    })
    .route('/api/t/:orgId', tenant)
    .route('/api/c/:orgId', carrier)
    .route('/api/driver', driver)
    .onError(onError)
    .notFound(onNotFound);
}

const hallsNamed = async (name: string) => ownerDb().select().from(hall).where(eq(hall.name, name));

describe('scoped(): one transaction per request', () => {
  it('a handler that writes and then throws leaves no row', async () => {
    const name = randomUUID();
    const res = await as(toyApp(), w.A.users.dispatcher).post(`/api/t/${w.A.tenantId}/throws`, {
      headers: { 'X-Name': name },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: ErrorCode.conflict,
        message: 'after a write',
        details: { reason: ConflictReason.stale_version },
      },
    });
    expect(await hallsNamed(name)).toEqual([]);
  });

  it('a handler that writes and returns 409 leaves no row', async () => {
    const name = randomUUID();
    const res = await as(toyApp(), w.A.users.dispatcher).post(
      `/api/t/${w.A.tenantId}/returns-409`,
      {
        headers: { 'X-Name': name },
      },
    );
    expect(res.status).toBe(409);
    expect(await hallsNamed(name)).toEqual([]);
  });

  it('a handler that succeeds commits', async () => {
    const name = randomUUID();
    const res = await as(toyApp(), w.A.users.dispatcher).post(`/api/t/${w.A.tenantId}/commits`, {
      headers: { 'X-Name': name },
    });
    expect(res.status).toBe(201);
    expect(await hallsNamed(name)).toHaveLength(1);
  });
});

describe('scope resolution', () => {
  it('answers 401 without a session and 404 for an org the user is not a member of', async () => {
    const app = toyApp();
    expect((await as(app, null).get(`/api/t/${w.A.tenantId}/scope`)).status).toBe(401);
    expect((await as(app, w.B.users.dispatcher).get(`/api/t/${w.A.tenantId}/scope`)).status).toBe(
      404,
    );
    expect((await as(app, w.A.users.dispatcher).get('/api/t/not-a-uuid/scope')).status).toBe(404);
  });

  it('limits a gate operator to its sites and gives a dispatcher all sites', async () => {
    const app = toyApp();
    const gate = await (
      await as(app, w.A.users.gate_operator).get(`/api/t/${w.A.tenantId}/scope`)
    ).json();
    expect(gate).toMatchObject({
      party: ScopeParty.tenant,
      tenantId: w.A.tenantId,
      siteIds: [w.A.sites[0].id],
    });
    const dispatcher = await (
      await as(app, w.A.users.dispatcher).get(`/api/t/${w.A.tenantId}/scope`)
    ).json();
    expect(dispatcher).toMatchObject({ siteIds: 'all', actor: { role: Role.dispatcher } });
  });

  it('resolves carrier_at_tenant under /at/:tenantId only for a linked tenant', async () => {
    const app = toyApp();
    const user = w.A.users.carrier_user;
    const base = `/api/c/${w.A.carrierId}`;
    expect(await (await as(app, user).get(`${base}/scope`)).json()).toMatchObject({
      party: ScopeParty.carrier,
      carrierId: w.A.carrierId,
      role: Role.carrier_user,
    });
    expect(
      await (await as(app, user).get(`${base}/at/${w.A.tenantId}/scope`)).json(),
    ).toMatchObject({
      party: ScopeParty.carrier_at_tenant,
      carrierId: w.A.carrierId,
      tenantId: w.A.tenantId,
    });
    expect((await as(app, user).get(`${base}/at/${w.B.tenantId}/scope`)).status).toBe(404);
  });

  it('resolves a driver cookie to its booking and refuses an unknown one', async () => {
    const app = toyApp();
    const own = w.A.bookings.own;
    expect(await (await as(app, own).get('/api/driver/scope')).json()).toEqual({
      party: ScopeParty.driver,
      tenantId: w.A.tenantId,
      bookingId: own.id,
      channel: DriverChannel.link,
    });
    expect((await as(app, { driverToken: 'forged' }).get('/api/driver/scope')).status).toBe(401);
    expect((await as(app, null).get('/api/driver/scope')).status).toBe(401);
  });
});

describe('last activity (PL-04)', () => {
  it('records the first request after sign-in and then at most every 5 minutes', async () => {
    const t = await world();
    const user = t.A.users.dispatcher;
    const clock = testClock(WORLD_NOW);
    const app = toyApp(clock);
    const lastSeen = async () =>
      (
        await ownerDb()
          .select({ at: appUser.lastSeenAt })
          .from(appUser)
          .where(eq(appUser.id, user.id))
      )[0]?.at;
    const request = async () =>
      expect((await as(app, user).get(`/api/t/${t.A.tenantId}/scope`)).status).toBe(200);

    expect(await lastSeen()).toBeNull();
    await request();
    expect(await lastSeen()).toEqual(WORLD_NOW);
    clock.advance(2 * 60_000);
    await request();
    expect(await lastSeen()).toEqual(WORLD_NOW);
    clock.advance(4 * 60_000);
    await request();
    expect(await lastSeen()).toEqual(new Date(WORLD_NOW.getTime() + 6 * 60_000));
  });
});
