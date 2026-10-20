import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { DriverLocale, Role, StaffLocale, ZodIssueCode } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, type WorldUser, world } from '../../../../test/world.ts';
import { app } from '../../../app.ts';
import { appUser, membership } from '../schema.ts';

let w: World;
beforeAll(async () => {
  w = await world();
});

describe('/api/me', () => {
  it('lists every membership of the user for the org picker', async () => {
    const user = w.A.users.dispatcher;
    await ownerDb().insert(membership).values({
      userId: user.id,
      orgId: w.B.carrierId,
      orgKind: 'carrier',
      role: Role.carrier_admin,
    });
    const res = await as(app, user).get('/api/me');
    expect(res.status).toBe(200);
    const me = (await res.json()) as MeResponse;
    expect(me.user).toEqual({
      id: user.id,
      name: expect.any(String),
      email: user.email,
      locale: StaffLocale.en,
    });
    expect(me.memberships).toEqual([
      {
        orgId: w.A.tenantId,
        orgKind: 'tenant',
        orgName: expect.stringMatching(/^Tenant A/),
        role: Role.dispatcher,
      },
      {
        orgId: w.B.carrierId,
        orgKind: 'carrier',
        orgName: expect.stringMatching(/^Carrier B/),
        role: Role.carrier_admin,
      },
    ]);
  });

  it('changes name and locale, and rejects a locale outside de, en and pl', async () => {
    const user = w.A.users.gate_operator;
    const ok = await as(app, user).patch('/api/me', {
      body: { name: 'Gerd Gate', locale: StaffLocale.de },
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as MeResponse).user).toMatchObject({
      name: 'Gerd Gate',
      locale: StaffLocale.de,
    });
    const bad = await as(app, user).patch('/api/me', { body: { locale: DriverLocale.tr } });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({
      error: { details: { issues: [{ path: ['locale'] }] } },
    });
  });

  describe('uiPrefs', () => {
    const PACKAGES = 'platform.packages.openModules';
    const TENANT = 'platform.tenant.openModules';
    const stored = async (id: WorldUser['id']) =>
      (await ownerDb().select({ v: appUser.uiPrefs }).from(appUser).where(eq(appUser.id, id)))[0]
        ?.v;
    const read = async (user: WorldUser) =>
      ((await (await as(app, user).get('/api/me')).json()) as MeResponse).uiPrefs;

    it('answers {} for a user who never stored a preference', async () => {
      expect(await read(w.A.users.carrier_user)).toEqual({});
    });

    it('stores a known key and returns it', async () => {
      const user = w.A.users.dock_operator;
      const res = await as(app, user).patch('/api/me', {
        body: { uiPrefs: { [PACKAGES]: ['yard', 'safety'] } },
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as MeResponse).uiPrefs).toEqual({
        [PACKAGES]: ['yard', 'safety'],
      });
    });

    it('merges writes of different keys and keeps both', async () => {
      const user = w.A.users.tenant_admin;
      await as(app, user).patch('/api/me', { body: { uiPrefs: { [PACKAGES]: ['yard'] } } });
      await as(app, user).patch('/api/me', { body: { uiPrefs: { [TENANT]: ['brand'] } } });
      expect(await read(user)).toEqual({ [PACKAGES]: ['yard'], [TENANT]: ['brand'] });
    });

    it('keeps the stored preferences when only the name changes', async () => {
      const user = w.A.users.dock_operator_other_site;
      await as(app, user).patch('/api/me', { body: { uiPrefs: { [TENANT]: ['core'] } } });
      const res = await as(app, user).patch('/api/me', { body: { name: 'New name' } });
      expect(res.status).toBe(200);
      expect(await stored(user.id)).toEqual({ [TENANT]: ['core'] });
    });

    it('rejects an unknown key with 422 and stores nothing', async () => {
      const user = w.A.users.dispatcher;
      const before = await stored(user.id);
      const res = await as(app, user).patch('/api/me', {
        body: { name: 'Not stored', uiPrefs: { 'platform.unknown': [] } },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({
        error: {
          details: {
            issues: [
              {
                path: ['uiPrefs'],
                code: ZodIssueCode.unrecognized_keys,
                message: expect.stringContaining('platform.unknown'),
              },
            ],
          },
        },
      });
      expect(await stored(user.id)).toEqual(before);
    });

    it('rejects an invalid value with 422 at its path and stores nothing', async () => {
      const user = w.A.users.dispatcher;
      const before = await stored(user.id);
      const res = await as(app, user).patch('/api/me', {
        body: { uiPrefs: { [PACKAGES]: ['nope'] } },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({
        error: { details: { issues: [{ path: ['uiPrefs', PACKAGES, 0] }] } },
      });
      expect(await stored(user.id)).toEqual(before);
    });

    it('leaves out a stored key that is unknown or no longer valid', async () => {
      const user = w.B.users.dispatcher;
      await ownerDb()
        .update(appUser)
        .set({ uiPrefs: { removed: true, [PACKAGES]: ['gone'], [TENANT]: ['yard'] } })
        .where(eq(appUser.id, user.id));
      const res = await as(app, user).get('/api/me');
      expect(res.status).toBe(200);
      expect(((await res.json()) as MeResponse).uiPrefs).toEqual({ [TENANT]: ['yard'] });
    });

    it("changes only the signed-in user's preferences", async () => {
      const a = w.B.users.gate_operator;
      const b = w.B.users.tenant_admin;
      await as(app, a).patch('/api/me', { body: { uiPrefs: { [PACKAGES]: ['booking'] } } });
      await as(app, b).patch('/api/me', { body: { uiPrefs: { [PACKAGES]: ['avis'] } } });
      expect(await stored(a.id)).toEqual({ [PACKAGES]: ['booking'] });
      expect(await stored(b.id)).toEqual({ [PACKAGES]: ['avis'] });
    });
  });
});
