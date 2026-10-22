import { TenantStatus } from './values.ts';

/**
 * The status of a tenant, derived from `org.suspended_at` and `org.activated_at`
 * (tenant-lifecycle). A suspension wins over onboarding and activation.
 */
export const tenantStatus = (tenant: {
  activatedAt: Date | null;
  suspendedAt: Date | null;
}): TenantStatus =>
  tenant.suspendedAt !== null
    ? TenantStatus.suspended
    : tenant.activatedAt === null
      ? TenantStatus.onboarding
      : TenantStatus.active;
