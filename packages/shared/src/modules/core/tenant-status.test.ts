import { describe, expect, it } from 'vitest';
import { tenantStatus } from './tenant-status.ts';
import { TenantStatus } from './values.ts';

const at = new Date('2026-10-19T08:00:00Z');

describe('tenantStatus', () => {
  it('is onboarding without an activation time', () => {
    expect(tenantStatus({ activatedAt: null, suspendedAt: null })).toBe(TenantStatus.onboarding);
  });

  it('is active once the activation time is set', () => {
    expect(tenantStatus({ activatedAt: at, suspendedAt: null })).toBe(TenantStatus.active);
  });

  it('is suspended while a suspension time is set, activated or not', () => {
    expect(tenantStatus({ activatedAt: at, suspendedAt: at })).toBe(TenantStatus.suspended);
    expect(tenantStatus({ activatedAt: null, suspendedAt: at })).toBe(TenantStatus.suspended);
  });
});
