import { Salutation, TaxIdStatus, TaxIdType } from '@rampflow/shared/modules/core/values';
import { Setting } from '@rampflow/shared/values';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.ts';
import { appUser, org, settingValue } from '../../src/modules/core/schema.ts';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { as } from '../../test/http.ts';
import {
  ACME,
  ACME_CANCEL_CUTOFF_MINUTES,
  ACME_VAT,
  ADMIN_UI_PREFS,
  DEMO_PASSWORD,
  DEMO_USERS,
  PLATFORM_HORIZON_DAYS,
  seed,
  TRANS_POL,
} from './core.ts';

const run = () => ownerDb().transaction((tx) => seed({ db: tx, log: () => undefined }));

describe('pnpm db:seed, core', () => {
  it('converges to the same demo data when run twice, and every account signs in', async () => {
    await run();
    await run();
    expect(await ownerCount('org', sql`kind = 'tenant' and name = ${ACME}`)).toBe(1);
    expect(await ownerCount('org', sql`kind = 'carrier' and name = ${TRANS_POL}`)).toBe(1);
    const [acme] = await ownerDb().select().from(org).where(eq(org.name, ACME));
    expect(acme).toMatchObject({
      taxIdType: TaxIdType.eu_vat,
      taxIdValue: ACME_VAT,
      taxIdStatus: TaxIdStatus.verified,
      activatedAt: acme?.createdAt,
    });
    expect(acme?.taxIdCheckedAt).toBeInstanceOf(Date);
    const [anna] = await ownerDb()
      .select({ g: appUser.givenName, f: appUser.familyName, s: appUser.salutation })
      .from(appUser)
      .where(eq(appUser.email, 'admin@acme.local'));
    expect(anna).toEqual({ g: 'Anna', f: 'Lenz', s: Salutation.ms });
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

  it('opens two package groups for the platform admin and keeps keys set by hand', async () => {
    const email = 'admin@rampflow.local';
    const prefs = async () =>
      (
        await ownerDb().select({ v: appUser.uiPrefs }).from(appUser).where(eq(appUser.email, email))
      )[0]?.v;
    await run();
    await ownerDb()
      .update(appUser)
      .set({ uiPrefs: { 'platform.tenant.openModules': ['yard'] } })
      .where(eq(appUser.email, email));
    await run();
    await run();
    expect(await prefs()).toEqual({ ...ADMIN_UI_PREFS, 'platform.tenant.openModules': ['yard'] });
  });

  it('stores one platform horizon and one Acme cutoff, however often it runs', async () => {
    await run();
    await run();
    const rows = await ownerDb()
      .select({ key: settingValue.key, value: settingValue.value, tenantId: settingValue.tenantId })
      .from(settingValue)
      .where(
        sql`(${settingValue.tenantId} is null and ${settingValue.key} = ${Setting.booking.horizon_days})
          or (${settingValue.tenantId} = (select id from org where name = ${ACME})
            and ${settingValue.siteId} is null
            and ${settingValue.key} = ${Setting.booking.cancel_cutoff_minutes})`,
      );
    const [acme] = await ownerDb().select({ id: org.id }).from(org).where(eq(org.name, ACME));
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { key: Setting.booking.horizon_days, value: { v: PLATFORM_HORIZON_DAYS }, tenantId: null },
        {
          key: Setting.booking.cancel_cutoff_minutes,
          value: { v: ACME_CANCEL_CUTOFF_MINUTES },
          tenantId: acme?.id,
        },
      ]),
    );
  });
});
