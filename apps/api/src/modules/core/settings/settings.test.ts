import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import {
  BadRequestReason,
  ErrorCode,
  PackageId,
  SettingScope,
  SettingSource,
  ZodIssueCode,
} from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { settingValue } from '../schema.ts';
import { errorOf } from '../staff/fixtures.ts';

// TN-02 through /api/t/:orgId/settings against Postgres.

const app = createApp({ clock: testClock(new Date()) });

let w: World;
beforeAll(async () => {
  w = await world({ packages: { A: PackageId.start, B: PackageId.pro } });
});

const path = (side: World['A'], key = '') => `/api/t/${side.tenantId}/settings${key && `/${key}`}`;
const admin = (side: World['A']) => as(app, side.users.tenant_admin);

async function view(side: World['A'], siteId?: string) {
  const res = await admin(side).get(`${path(side)}${siteId ? `?siteId=${siteId}` : ''}`);
  expect(res.status).toBe(200);
  return (await res.json()) as SettingsView;
}
const field = (v: SettingsView, key: string) => v.items.find((i) => i.key === key);

describe('TN-02 settings', () => {
  it('shows each field with value and source; a site value overrides only that site', async () => {
    const before = await view(w.B);
    expect(before.scope).toBe('tenant');
    expect(field(before, 'booking.horizon_days')).toEqual({
      key: 'booking.horizon_days',
      module: 'booking',
      scopes: ['platform', 'tenant', 'site'],
      value: 30,
      source: SettingSource.default,
      inherited: { value: 30, source: SettingSource.default },
    });
    // Site-only keys appear on the site level, platform-and-tenant keys on the tenant level.
    expect(field(before, 'booking.public_link_enabled')).toBeUndefined();
    expect(field(before, 'safety.quiz_pass_percent')).toBeDefined();

    const tenantPut = await admin(w.B).put(path(w.B, 'booking.horizon_days'), {
      body: { siteId: null, value: 60 },
    });
    expect(tenantPut.status).toBe(200);
    expect(await tenantPut.json()).toMatchObject({ value: 60, source: SettingSource.tenant });
    const sitePut = await admin(w.B).put(path(w.B, 'booking.horizon_days'), {
      body: { siteId: w.B.sites[0].id, value: 90 },
    });
    expect(await sitePut.json()).toMatchObject({
      value: 90,
      source: SettingSource.site,
      inherited: { value: 60, source: SettingSource.tenant },
    });

    const site0 = await view(w.B, w.B.sites[0].id);
    expect(site0).toMatchObject({ scope: SettingScope.site, siteId: w.B.sites[0].id });
    expect(field(site0, 'booking.horizon_days')).toMatchObject({
      value: 90,
      source: SettingSource.site,
    });
    expect(field(site0, 'booking.public_link_enabled')).toBeDefined();
    expect(field(site0, 'safety.quiz_pass_percent')).toBeUndefined();
    const site1 = await view(w.B, w.B.sites[1].id);
    expect(field(site1, 'booking.horizon_days')).toMatchObject({
      value: 60,
      source: SettingSource.tenant,
    });
    expect(field(await view(w.B), 'booking.horizon_days')).toMatchObject({
      value: 60,
      source: SettingSource.tenant,
    });
  });

  it('"Reset to inherited" deletes the override', async () => {
    const key = 'yard.grace_minutes';
    await admin(w.B).put(path(w.B, key), { body: { siteId: w.B.sites[1].id, value: 5 } });
    const reset = await admin(w.B).delete(`${path(w.B, key)}?siteId=${w.B.sites[1].id}`);
    expect(reset.status).toBe(204);
    const rows = await ownerDb()
      .select()
      .from(settingValue)
      .where(and(eq(settingValue.tenantId, w.B.tenantId), eq(settingValue.key, key)));
    expect(rows).toEqual([]);
    expect(field(await view(w.B, w.B.sites[1].id), key)).toMatchObject({
      value: 15,
      source: SettingSource.default,
    });
    expect((await admin(w.B).delete(`${path(w.B, key)}?siteId=${w.B.sites[1].id}`)).status).toBe(
      204,
    );
  });

  it('hides a setting whose entitlement is off and answers 403 to its write', async () => {
    // Start has no safety.gate_enforcement.
    expect(field(await view(w.A), 'safety.require_for_checkin')).toBeUndefined();
    expect(field(await view(w.B), 'safety.require_for_checkin')).toBeDefined();
    const res = await admin(w.A).put(path(w.A, 'safety.require_for_checkin'), {
      body: { siteId: null, value: false },
    });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toMatchObject({
      code: ErrorCode.entitlement_required,
      details: { key: 'safety.gate_enforcement' },
    });
  });

  it('answers 422 for a retention value above the maximum, 400 for a level the key lacks', async () => {
    const res = await admin(w.B).put(path(w.B, 'privacy.retention.driver_phone_days'), {
      body: { siteId: null, value: 31 },
    });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['value'], code: ZodIssueCode.too_big }),
    ]);
    const platformOnly = await admin(w.B).put(path(w.B, 'privacy.retention.driver_link_hours'), {
      body: { siteId: null, value: 12 },
    });
    expect(platformOnly.status).toBe(400);
    expect(await errorOf(platformOnly)).toMatchObject({
      details: { reason: BadRequestReason.scope_not_allowed, allowed: ['platform'] },
    });
    const unknown = await admin(w.B).put(path(w.B, 'booking.nope'), {
      body: { siteId: null, value: 1 },
    });
    expect(unknown.status).toBe(400);
  });

  it('answers 404 for a site of another tenant and keeps operators out', async () => {
    const res = await admin(w.B).get(`${path(w.B)}?siteId=${w.A.sites[0].id}`);
    expect(res.status).toBe(404);
    const put = await admin(w.B).put(path(w.B, 'booking.horizon_days'), {
      body: { siteId: w.A.sites[0].id, value: 10 },
    });
    expect(put.status).toBe(404);
    expect((await as(app, w.B.users.dispatcher).get(path(w.B))).status).toBe(403);
  });
});
