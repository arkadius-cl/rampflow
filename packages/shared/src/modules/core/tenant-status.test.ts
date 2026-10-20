import { describe, expect, it } from 'vitest';
import { tenantStatus } from './tenant-status.ts';
import { TenantStatus } from './values.ts';

describe('tenantStatus', () => {
  it('is onboarding without an activation time', () => {
    expect(tenantStatus({ activatedAt: null })).toBe(TenantStatus.onboarding);
  });

  it('is active once the activation time is set', () => {
    expect(tenantStatus({ activatedAt: new Date('2026-10-19T08:00:00Z') })).toBe(
      TenantStatus.active,
    );
  });
});
