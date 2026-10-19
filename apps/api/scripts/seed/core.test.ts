import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.ts';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { as } from '../../test/http.ts';
import { ACME, DEMO_PASSWORD, DEMO_USERS, seed, TRANS_POL } from './core.ts';

const run = () => ownerDb().transaction((tx) => seed({ db: tx, log: () => undefined }));

describe('pnpm db:seed, core', () => {
  it('converges to the same demo data when run twice, and every account signs in', async () => {
    await run();
    await run();
    expect(await ownerCount('org', sql`kind = 'tenant' and name = ${ACME}`)).toBe(1);
    expect(await ownerCount('org', sql`kind = 'carrier' and name = ${TRANS_POL}`)).toBe(1);
    for (const u of DEMO_USERS) {
      expect(
        await ownerCount(
          'membership',
          sql`user_id = (select id from app_user where email = ${u.email})`,
        ),
      ).toBe(1);
      const res = await as(app, null).post('/api/auth/login', {
        body: { email: u.email, password: DEMO_PASSWORD },
      });
      expect(res.status, u.email).toBe(200);
    }
    const carrier = await as(app, null).post('/api/auth/login', {
      body: { email: 'admin@trans-pol.local', password: DEMO_PASSWORD },
    });
    const cookie = /rf_session=([^;]+)/.exec(carrier.headers.get('set-cookie') ?? '')?.[1] ?? '';
    const me = (await (
      await app.request('/api/me', { headers: { Cookie: `rf_session=${cookie}` } })
    ).json()) as { memberships: { orgId: string }[] };
    const [m] = me.memberships;
    const ctx = await app.request(`/api/c/${m?.orgId}/context`, {
      headers: { Cookie: `rf_session=${cookie}` },
    });
    expect(
      ((await ctx.json()) as { tenants: { name: string }[] }).tenants.map((t) => t.name),
    ).toEqual([ACME]);
  });
});
