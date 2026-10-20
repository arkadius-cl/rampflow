import { describe, expect, it } from 'vitest';
import { packages } from '../packages.ts';
import { catalog } from '../registry.ts';
import { Feature, Setting } from '../values/keys.ts';
import { SettingScope, SettingSource, SettingWriteErrorCode } from '../values/settings.ts';
import { ZodIssueCode } from '../values/validation.ts';
import { resolveEntitlements } from './entitlements.ts';
import { isSettingAvailable, parseSettingWrite, resolveSetting } from './settings.ts';

const now = new Date('2026-10-19T08:00:00Z');
const start = resolveEntitlements(catalog, packages.start, [], now);
const pro = resolveEntitlements(catalog, packages.pro, [], now);

describe('resolveSetting', () => {
  it('walks site, tenant, platform, then the default, and names the source', () => {
    const key = 'booking.slot_grid_minutes';
    expect(resolveSetting(catalog, key, { site: 15, tenant: 20, platform: 10 })).toEqual({
      value: 15,
      source: SettingSource.site,
    });
    expect(resolveSetting(catalog, key, { tenant: 20, platform: 10 })).toEqual({
      value: 20,
      source: SettingSource.tenant,
    });
    expect(resolveSetting(catalog, key, { platform: 10 })).toEqual({
      value: 10,
      source: SettingSource.platform,
    });
    expect(resolveSetting(catalog, key, {})).toEqual({ value: 30, source: SettingSource.default });
  });

  it('ignores a level the setting does not allow', () => {
    const resolved = resolveSetting(catalog, Setting.safety.quiz_pass_percent, {
      site: 60,
      tenant: 80,
    });
    expect(resolved).toEqual({ value: 80, source: SettingSource.tenant });
  });

  it('falls through a stored value that no longer parses', () => {
    const resolved = resolveSetting(catalog, Setting.booking.slot_grid_minutes, {
      site: 7,
      tenant: 20,
    });
    expect(resolved).toEqual({ value: 20, source: SettingSource.tenant });
  });

  it('keeps an explicit null that the schema allows', () => {
    const resolved = resolveSetting(catalog, Setting.privacy.notice_url, {
      tenant: null,
      platform: 'https://rampflow.example/privacy',
    });
    expect(resolved).toEqual({ value: null, source: SettingSource.tenant });
  });
});

describe('parseSettingWrite', () => {
  it('rejects a value outside the zod range with the issue path', () => {
    const scalar = parseSettingWrite(catalog, start, {
      key: 'yard.grace_minutes',
      scope: SettingScope.site,
      value: 241,
    });
    expect(scalar).toMatchObject({
      ok: false,
      error: {
        code: SettingWriteErrorCode.invalid_value,
        issues: [{ path: [], code: ZodIssueCode.too_big }],
      },
    });
    const list = parseSettingWrite(catalog, start, {
      key: 'avis.required_reference_types',
      scope: SettingScope.tenant,
      value: ['purchase_order', 'bill_of_lading'],
    });
    expect(list).toMatchObject({ ok: false, error: { issues: [{ path: [1] }] } });
  });

  it('rejects retention above the platform maximum', () => {
    const write = {
      key: 'privacy.retention.driver_phone_days',
      scope: 'tenant',
      value: 31,
    } as const;
    expect(parseSettingWrite(catalog, start, write)).toMatchObject({
      ok: false,
      error: { code: SettingWriteErrorCode.invalid_value },
    });
  });

  it('rejects a scope the setting does not allow', () => {
    const write = {
      key: 'privacy.retention.driver_link_hours',
      scope: 'tenant',
      value: 12,
    } as const;
    expect(parseSettingWrite(catalog, start, write)).toMatchObject({
      ok: false,
      error: { code: SettingWriteErrorCode.scope_not_allowed, allowed: ['platform'] },
    });
  });

  it('rejects writes while the required entitlement or the module is off', () => {
    const gated = { key: 'safety.require_for_checkin', scope: 'site', value: false } as const;
    expect(parseSettingWrite(catalog, start, gated)).toMatchObject({
      ok: false,
      error: {
        code: SettingWriteErrorCode.entitlement_required,
        entitlement: 'safety.gate_enforcement',
      },
    });
    expect(parseSettingWrite(catalog, pro, gated).ok).toBe(true);

    const noYard = resolveEntitlements(
      catalog,
      packages.pro,
      [{ key: Feature.yard.checkin_qr, value: false, expiresAt: null }],
      now,
    );
    const yardSetting = { key: 'yard.grace_minutes', scope: 'tenant', value: 10 } as const;
    expect(parseSettingWrite(catalog, noYard, yardSetting)).toMatchObject({
      error: { code: SettingWriteErrorCode.entitlement_required, entitlement: 'yard.checkin_qr' },
    });
    expect(isSettingAvailable(catalog, noYard, Setting.yard.grace_minutes)).toBe(false);
    expect(isSettingAvailable(catalog, pro, Setting.yard.grace_minutes)).toBe(true);
  });

  it('accepts platform writes without tenant entitlements, gated keys included', () => {
    const gated = { key: 'safety.require_for_checkin', scope: 'platform', value: false } as const;
    expect(parseSettingWrite(catalog, null, gated)).toEqual({ ok: true, value: gated });
    const tooBig = { key: 'yard.grace_minutes', scope: 'platform', value: 241 } as const;
    expect(parseSettingWrite(catalog, null, tooBig)).toMatchObject({
      ok: false,
      error: { code: SettingWriteErrorCode.invalid_value },
    });
    expect(() =>
      parseSettingWrite(catalog, null, {
        key: 'yard.grace_minutes',
        scope: SettingScope.site,
        value: 10,
      }),
    ).toThrow(/needs the tenant's entitlements/);
  });

  it('rejects unknown keys and returns the parsed value otherwise', () => {
    expect(
      parseSettingWrite(catalog, start, {
        key: 'booking.teleport',
        scope: SettingScope.site,
        value: 1,
      }),
    ).toMatchObject({ ok: false, error: { code: SettingWriteErrorCode.unknown_key } });
    expect(
      parseSettingWrite(catalog, start, {
        key: 'booking.horizon_days',
        scope: SettingScope.site,
        value: 14,
      }),
    ).toEqual({ ok: true, value: { key: 'booking.horizon_days', scope: 'site', value: 14 } });
  });
});
