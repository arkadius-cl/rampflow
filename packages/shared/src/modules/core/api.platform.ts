import * as z from 'zod';
import type { EntitlementSource } from '../../contract/entitlements.ts';
import type { Limit } from '../../contract/module.ts';
import { PACKAGE_IDS, type PackageId } from '../../packages.ts';
import type { ImplementedLimitKey, ModuleId } from '../../registry.ts';

// Request schemas and response shapes of /api/platform (PL-01 to PL-04).

const name = z.string().trim().min(1).max(120);

export const CreateTenant = z.object({
  name,
  package: z.enum(PACKAGE_IDS),
  adminEmail: z.email().max(254),
});
export type CreateTenant = z.infer<typeof CreateTenant>;

export const UpdateTenant = z.object({ name, package: z.enum(PACKAGE_IDS) }).partial();
export type UpdateTenant = z.infer<typeof UpdateTenant>;

export const InviteTenantAdmin = z.object({ email: z.email().max(254) });
export type InviteTenantAdmin = z.infer<typeof InviteTenantAdmin>;

/**
 * `PUT /tenants/:tenantId/overrides/:key`. The value's kind is checked against the key after the
 * key itself (400 for unknown or reserved keys, then 422 on `value`).
 */
export const PutOverride = z.object({
  value: z.union([z.boolean(), z.int().min(0), z.null()]),
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
});
export type PutOverride = z.infer<typeof PutOverride>;

/** The limits a tenant's usage is measured against (PL-04). */
export const USAGE_KEYS = [
  'core.max_sites',
  'core.max_docks',
  'core.max_internal_users',
  'booking.max_bookings_per_month',
] as const satisfies readonly ImplementedLimitKey[];
export type UsageKey = (typeof USAGE_KEYS)[number];

export interface UsageMeter {
  used: number;
  /** `null` is unlimited. */
  limit: Limit;
  /** A soft limit only flags usage; a hard limit blocks the next write at `limit`. */
  soft: boolean;
  /** `used > limit`. Blocks nothing by itself. */
  over: boolean;
}

export type TenantUsage = Record<UsageKey, UsageMeter>;

export interface TenantSummary {
  id: string;
  name: string;
  package: PackageId;
  usage: TenantUsage;
}

export interface TenantList {
  items: TenantSummary[];
}

export interface EntitlementView {
  key: string;
  module: ModuleId;
  kind: 'feature' | 'limit';
  soft: boolean;
  value: boolean | Limit;
  source: EntitlementSource;
  /** What the tenant's package grants, `undefined` when the package omits the key (off). */
  packageValue?: boolean | Limit;
}

export interface OverrideView {
  key: string;
  value: boolean | Limit;
  expiresAt: string | null;
  note: string | null;
  /** `false` once `expiresAt` has passed: the row stays but no longer applies. */
  active: boolean;
}

export interface PendingInvitationView {
  id: string;
  email: string;
  expiresAt: string;
}

export interface TenantDetail extends TenantSummary {
  /** Every implemented key, in catalog order. */
  entitlements: EntitlementView[];
  overrides: OverrideView[];
  adminInvitations: PendingInvitationView[];
}

export interface PackageView {
  id: PackageId;
  values: {
    key: string;
    module: ModuleId;
    kind: 'feature' | 'limit';
    soft: boolean;
    value: boolean | Limit;
  }[];
}

export interface PackageList {
  items: PackageView[];
}
