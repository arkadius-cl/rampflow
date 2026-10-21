import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import {
  BadRequestReason,
  ErrorCode,
  Feature,
  PackageId,
  ScopeParty,
  Setting,
  SettingScope,
  SettingSource,
  StaffLocale,
  TenantActorKind,
  TenantRole,
  ZodIssueCode,
} from '@rampflow/shared/values';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { type SiteId, wrapJson } from '../../../db/ids.ts';
import { withScope } from '../../../db/scope.ts';
import { loadAccess } from '../../../kernel/access.ts';
import { systemClock, testClock } from '../../../kernel/clock.ts';
import { settingValue } from '../schema.ts';
import { errorOf } from '../staff/fixtures.ts';

// TN-02 through /api/t/:orgId/settings against Postgres.

const NOW = new Date();
const app = createApp({ clock: testClock(NOW) });

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

describe('TN-02, PL-03 saving a topic form in one request', () => {
  // A world of its own, so these writes meet no override of the tests above.
  let v: World;
  beforeAll(async () => {
    v = await world({ packages: { A: PackageId.start, B: PackageId.pro } });
  });

  const patch = (side: World['A'], body: unknown) =>
    admin(side).patch(path(side), { body: body as Record<string, unknown> });
  const rowsOf = (side: World['A'], ...keys: string[]) =>
    ownerDb()
      .select()
      .from(settingValue)
      .where(eq(settingValue.tenantId, side.tenantId))
      .then((rows) => rows.filter((r) => keys.includes(r.key)));
  const horizon = Setting.booking.horizon_days;
  const lead = Setting.booking.min_lead_minutes;

  it('stores two keys, with who and when', async () => {
    const res = await patch(v.B, { siteId: null, set: { [horizon]: 45, [lead]: 60 }, reset: [] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SettingsView;
    expect(body).toMatchObject({ scope: SettingScope.tenant, siteId: null });
    expect(field(body, horizon)).toMatchObject({ value: 45, source: SettingSource.tenant });
    expect(field(body, lead)).toMatchObject({ value: 60, source: SettingSource.tenant });
    const rows = await rowsOf(v.B, horizon, lead);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ siteId: null, updatedBy: v.B.users.tenant_admin.id });
      expect(row.updatedAt).toEqual(NOW);
    }
  });

  it('overwrites a stored value in place, with the new who and when', async () => {
    const yesterday = new Date(NOW.getTime() - 86_400_000);
    await ownerDb()
      .update(settingValue)
      .set({ updatedBy: v.platformAdmin.id, updatedAt: yesterday })
      .where(and(eq(settingValue.tenantId, v.B.tenantId), eq(settingValue.key, horizon)));
    const res = await patch(v.B, { siteId: null, set: { [horizon]: 50 }, reset: [] });
    expect(res.status).toBe(200);
    expect(await rowsOf(v.B, horizon)).toEqual([
      expect.objectContaining({
        siteId: null,
        value: wrapJson(50),
        updatedBy: v.B.users.tenant_admin.id,
        updatedAt: NOW,
      }),
    ]);
    await patch(v.B, { siteId: null, set: { [horizon]: 45 }, reset: [] });
  });

  it('stores nothing when one value is invalid, and names it under set', async () => {
    const res = await patch(v.B, { siteId: null, set: { [horizon]: 50, [lead]: -1 }, reset: [] });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['set', lead], code: ZodIssueCode.too_small }),
    ]);
    expect(field(await view(v.B), horizon)).toMatchObject({ value: 45 });
    expect(field(await view(v.B), lead)).toMatchObject({ value: 60 });
  });

  it('sets one key and resets another in one call', async () => {
    const early = Setting.yard.early_tolerance_minutes;
    const grace = Setting.yard.grace_minutes;
    await admin(v.B).put(path(v.B, early), { body: { siteId: null, value: 90 } });
    const res = await patch(v.B, { siteId: null, set: { [grace]: 20 }, reset: [early] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SettingsView;
    expect(field(body, grace)).toMatchObject({ value: 20, source: SettingSource.tenant });
    expect(field(body, early)).toMatchObject({ source: SettingSource.default });
    expect(await rowsOf(v.B, early)).toEqual([]);
  });

  it('writes a site level and leaves the tenant level alone', async () => {
    const siteId = v.B.sites[0].id;
    const res = await patch(v.B, { siteId, set: { [horizon]: 10 }, reset: [] });
    expect(field((await res.json()) as SettingsView, horizon)).toMatchObject({
      value: 10,
      source: SettingSource.site,
      inherited: { value: 45, source: SettingSource.tenant },
    });
    expect(field(await view(v.B), horizon)).toMatchObject({ value: 45 });
  });

  it('refuses an unknown key, a missing level and an entitlement that is off, storing nothing', async () => {
    const before = await rowsOf(v.A, horizon);
    const unknown = await patch(v.A, {
      siteId: null,
      set: { [horizon]: 20, 'booking.nope': 1 },
      reset: [],
    });
    expect(unknown.status).toBe(400);
    expect(await errorOf(unknown)).toMatchObject({
      details: { reason: BadRequestReason.unknown_key },
    });
    const unknownReset = await patch(v.A, {
      siteId: null,
      set: { [horizon]: 20 },
      reset: ['booking.nope'],
    });
    expect(unknownReset.status).toBe(400);

    const platformOnly = await patch(v.A, {
      siteId: null,
      set: { [horizon]: 20 },
      reset: [Setting.privacy.retention.driver_link_hours],
    });
    expect(platformOnly.status).toBe(400);
    expect(await errorOf(platformOnly)).toMatchObject({
      details: { reason: BadRequestReason.scope_not_allowed, allowed: [SettingScope.platform] },
    });

    // Start has no safety.gate_enforcement.
    const off = await patch(v.A, {
      siteId: null,
      set: { [horizon]: 20, [Setting.safety.require_for_checkin]: false },
      reset: [],
    });
    expect(off.status).toBe(403);
    expect(await errorOf(off)).toMatchObject({
      code: ErrorCode.entitlement_required,
      details: { key: Feature.safety.gate_enforcement },
    });
    expect(await rowsOf(v.A, horizon)).toEqual(before);
  });

  it('answers 422 for a key in set and reset and for an empty request, storing nothing', async () => {
    const both = await patch(v.A, { siteId: null, set: { [horizon]: 20 }, reset: [horizon] });
    expect(both.status).toBe(422);
    const empty = await patch(v.A, { siteId: null, set: {}, reset: [] });
    expect(empty.status).toBe(422);
    expect(await rowsOf(v.A, horizon)).toEqual([]);
  });

  it('answers 404 for a site of another tenant and stores nothing', async () => {
    const res = await patch(v.B, { siteId: v.A.sites[0].id, set: { [horizon]: 12 }, reset: [] });
    expect(res.status).toBe(404);
    expect(await rowsOf(v.A, horizon)).toEqual([]);
    expect(field(await view(v.B), horizon)).toMatchObject({ value: 45 });
  });

  it('saves the platform level in one request', async () => {
    const platform = as(app, v.platformAdmin);
    const res = await platform.patch('/api/platform/settings', {
      body: {
        set: { [horizon]: 40, [Setting.privacy.retention.driver_link_hours]: 12 },
        reset: [],
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SettingsView;
    expect(field(body, horizon)).toMatchObject({ value: 40, source: SettingSource.platform });
    const invalid = await platform.patch('/api/platform/settings', {
      body: { set: { [horizon]: 0 }, reset: [Setting.privacy.retention.driver_link_hours] },
    });
    expect(invalid.status).toBe(422);
    const reset = await platform.patch('/api/platform/settings', {
      body: { set: {}, reset: [horizon, Setting.privacy.retention.driver_link_hours] },
    });
    expect(reset.status).toBe(200);
    expect(
      await ownerDb().select().from(settingValue).where(isNull(settingValue.tenantId)),
    ).toEqual([]);
  });
});

describe('i18n.default_locale has no site level', () => {
  let v: World;
  beforeAll(async () => {
    v = await world({ packages: { A: PackageId.start, B: PackageId.pro } });
  });

  it('refuses a site write with the allowed levels', async () => {
    const res = await admin(v.B).put(path(v.B, Setting.i18n.default_locale), {
      body: { siteId: v.B.sites[0].id, value: StaffLocale.pl },
    });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({
      details: {
        reason: BadRequestReason.scope_not_allowed,
        allowed: [SettingScope.platform, SettingScope.tenant],
      },
    });
  });

  it('ignores a site row written before the change', async () => {
    const siteId = v.B.sites[0].id as SiteId;
    await ownerDb()
      .insert(settingValue)
      .values([
        {
          tenantId: v.B.tenantId,
          key: Setting.i18n.default_locale,
          value: wrapJson(StaffLocale.en),
          updatedBy: v.platformAdmin.id,
        },
        {
          tenantId: v.B.tenantId,
          siteId,
          key: Setting.i18n.default_locale,
          value: wrapJson(StaffLocale.pl),
          updatedBy: v.platformAdmin.id,
        },
      ]);
    expect(field(await view(v.B, siteId), Setting.i18n.default_locale)).toBeUndefined();
    const scope = {
      party: ScopeParty.tenant,
      tenantId: v.B.tenantId,
      siteIds: 'all',
      actor: {
        kind: TenantActorKind.user,
        userId: v.B.users.tenant_admin.id,
        role: TenantRole.tenant_admin,
      },
    } as const;
    const resolved = await withScope(scope, async (tx) =>
      (await loadAccess(tx, scope, systemClock)).setting(Setting.i18n.default_locale, siteId),
    );
    expect(resolved).toEqual({ value: StaffLocale.en, source: SettingSource.tenant });
  });
});
