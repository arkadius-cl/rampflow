import { TenantStatus } from './values.ts';

/** The status of a tenant, derived from `org.activated_at` (tenant-lifecycle). */
export const tenantStatus = (tenant: { activatedAt: Date | null }): TenantStatus =>
  tenant.activatedAt === null ? TenantStatus.onboarding : TenantStatus.active;
