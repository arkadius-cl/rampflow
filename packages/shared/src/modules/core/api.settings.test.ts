import { describe, expect, it } from 'vitest';
import { Setting } from '../../values/keys.ts';
import { PatchPlatformSettings, PatchTenantSettings } from './api.settings.ts';

const horizon = Setting.booking.horizon_days;
const siteId = '0b9e5e4c-3a7f-4e43-9d55-8f1f2b3c4d5e';

describe('PatchPlatformSettings', () => {
  it('accepts sets and resets of different keys', () => {
    const body = { set: { [horizon]: 45 }, reset: [Setting.yard.grace_minutes] };
    expect(PatchPlatformSettings.parse(body)).toEqual(body);
  });

  it('refuses a request without any entry', () => {
    const result = PatchPlatformSettings.safeParse({ set: {}, reset: [] });
    expect(result.error?.issues.map((i) => i.path)).toEqual([[]]);
  });

  it('refuses a key that is set and reset, at its place in reset', () => {
    const result = PatchPlatformSettings.safeParse({
      set: { [horizon]: 45 },
      reset: [Setting.yard.grace_minutes, horizon],
    });
    expect(result.error?.issues.map((i) => i.path)).toEqual([['reset', 1]]);
  });
});

describe('PatchTenantSettings', () => {
  it('needs the level: a site id or null for the tenant', () => {
    expect(PatchTenantSettings.safeParse({ set: { [horizon]: 45 }, reset: [] }).success).toBe(
      false,
    );
    expect(PatchTenantSettings.parse({ siteId, set: {}, reset: [horizon] }).siteId).toBe(siteId);
  });

  it('applies the same rules as the platform save', () => {
    const empty = PatchTenantSettings.safeParse({ siteId: null, set: {}, reset: [] });
    expect(empty.success).toBe(false);
    const both = PatchTenantSettings.safeParse({
      siteId: null,
      set: { [horizon]: 45 },
      reset: [horizon],
    });
    expect(both.error?.issues.map((i) => i.path)).toEqual([['reset', 0]]);
  });
});
