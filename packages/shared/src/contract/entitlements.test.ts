import { describe, expect, it } from 'vitest';
import { UsageKey } from '../modules/core/values.ts';
import { packages } from '../packages.ts';
import { catalog, type EntitlementOverride } from '../registry.ts';
import { OverrideErrorCode } from '../values/entitlements.ts';
import { Feature, Module } from '../values/keys.ts';
import { PackageId } from '../values/packages.ts';
import { blockingFeature, parseEntitlementOverride, resolveEntitlements } from './entitlements.ts';

const now = new Date('2026-10-19T08:00:00Z');
const later = new Date('2026-11-01T00:00:00Z');
const earlier = new Date('2026-10-01T00:00:00Z');

const resolve = (pkg: keyof typeof packages, overrides: EntitlementOverride[] = []) =>
  resolveEntitlements(catalog, packages[pkg], overrides, now);

describe('resolveEntitlements', () => {
  it('takes package values and leaves omitted keys off', () => {
    const e = resolve(PackageId.start);
    expect(e.limits['core.max_sites']).toBe(1);
    expect(e.sources['core.max_sites']).toBe('package');
    expect(e.features['booking.pools']).toBe(true);
    expect(e.features['safety.quiz']).toBe(false);
    expect(e.sources['safety.quiz']).toBe('default');
  });

  it('lets an override beat the package, raising or lowering', () => {
    const e = resolve(PackageId.start, [
      { key: UsageKey.max_sites, value: 3, expiresAt: null },
      { key: Feature.booking.pools, value: false, expiresAt: null },
      { key: Feature.safety.quiz, value: true, expiresAt: later },
    ]);
    expect([e.limits['core.max_sites'], e.sources['core.max_sites']]).toEqual([3, 'override']);
    expect([e.features['booking.pools'], e.sources['booking.pools']]).toEqual([false, 'override']);
    expect([e.features['safety.quiz'], e.sources['safety.quiz']]).toEqual([true, 'override']);
  });

  it('ignores an override from its expiry on', () => {
    const e = resolve(PackageId.start, [
      { key: UsageKey.max_sites, value: 3, expiresAt: earlier },
      { key: UsageKey.max_docks, value: 99, expiresAt: now },
    ]);
    expect([e.limits['core.max_sites'], e.sources['core.max_sites']]).toEqual([1, 'package']);
    expect(e.limits['core.max_docks']).toBe(10);
  });

  it('keeps null as unlimited from a package and from an override', () => {
    expect(resolve(PackageId.enterprise).limits['core.max_docks']).toBeNull();
    const e = resolve(PackageId.start, [
      { key: UsageKey.max_internal_users, value: null, expiresAt: null },
    ]);
    expect(e.limits['core.max_internal_users']).toBeNull();
  });

  it('resolves reserved keys to off', () => {
    const e = resolve(PackageId.enterprise);
    expect([e.features['booking.guest_link'], e.sources['booking.guest_link']]).toEqual([
      false,
      'reserved',
    ]);
    expect(e.limits['integration.max_api_calls_per_day']).toBe(0);
  });

  it('turns a module off when a module it depends on is off', () => {
    const e = resolve(PackageId.pro, [
      { key: Feature.yard.checkin_qr, value: false, expiresAt: null },
    ]);
    expect(e.modules.yard).toBe(false);
    expect(e.modules.report).toBe(false);
    expect([e.features['report.basic'], e.sources['report.basic']]).toEqual([false, 'module_off']);
    expect(e.features['yard.call_to_dock']).toBe(false);
    expect(e.modules.safety).toBe(true);
    expect(blockingFeature(catalog, e, Module.report)).toBe('yard.checkin_qr');
  });

  it('turns a module off with its enabling feature and zeroes its limits', () => {
    const e = resolve(PackageId.pro, [
      { key: Feature.safety.briefings, value: false, expiresAt: null },
    ]);
    expect(e.modules.safety).toBe(false);
    expect(e.features['safety.quiz']).toBe(false);
    expect([
      e.limits['safety.max_briefing_templates'],
      e.sources['safety.max_briefing_templates'],
    ]).toEqual([0, 'module_off']);
    expect(blockingFeature(catalog, e, Module.safety)).toBe('safety.briefings');
    expect(blockingFeature(catalog, e, Module.booking)).toBeNull();
  });
});

describe('parseEntitlementOverride', () => {
  const parse = (key: string, value: unknown) =>
    parseEntitlementOverride(catalog, { key, value, expiresAt: null });

  it('rejects unknown and reserved keys', () => {
    expect(parse('booking.teleport', true)).toEqual({
      ok: false,
      error: { code: OverrideErrorCode.unknown_key, key: 'booking.teleport' },
    });
    expect(parse('booking.guest_link', true)).toEqual({
      ok: false,
      error: { code: OverrideErrorCode.reserved_key, key: 'booking.guest_link' },
    });
  });

  it('rejects a value of the wrong kind', () => {
    expect(parse('booking.pools', 1)).toMatchObject({ ok: false, error: { expected: 'boolean' } });
    expect(parse('core.max_sites', -1)).toMatchObject({ ok: false, error: { expected: 'limit' } });
    expect(parse('core.max_sites', 1.5)).toMatchObject({
      ok: false,
      error: { code: OverrideErrorCode.invalid_value },
    });
  });

  it('accepts implemented keys with matching values', () => {
    expect(parse('core.max_sites', null)).toEqual({
      ok: true,
      value: { key: 'core.max_sites', value: null, expiresAt: null },
    });
    expect(parse('safety.quiz', true).ok).toBe(true);
  });
});
