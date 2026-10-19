import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { app } from '../../../app.ts';
import { membership } from '../schema.ts';

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
      role: 'carrier_admin',
    });
    const res = await as(app, user).get('/api/me');
    expect(res.status).toBe(200);
    const me = (await res.json()) as MeResponse;
    expect(me.user).toEqual({
      id: user.id,
      name: expect.any(String),
      email: user.email,
      locale: 'en',
    });
    expect(me.memberships).toEqual([
      {
        orgId: w.A.tenantId,
        orgKind: 'tenant',
        orgName: expect.stringMatching(/^Tenant A/),
        role: 'dispatcher',
      },
      {
        orgId: w.B.carrierId,
        orgKind: 'carrier',
        orgName: expect.stringMatching(/^Carrier B/),
        role: 'carrier_admin',
      },
    ]);
  });

  it('changes name and locale, and rejects a locale outside de, en and pl', async () => {
    const user = w.A.users.gate_operator;
    const ok = await as(app, user).patch('/api/me', { body: { name: 'Gerd Gate', locale: 'de' } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as MeResponse).user).toMatchObject({
      name: 'Gerd Gate',
      locale: 'de',
    });
    const bad = await as(app, user).patch('/api/me', { body: { locale: 'tr' } });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({
      error: { details: { issues: [{ path: ['locale'] }] } },
    });
  });
});
