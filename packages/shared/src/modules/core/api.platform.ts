import * as z from 'zod';
import type { EntitlementSource } from '../../contract/entitlements.ts';
import { defineList, type ListPage } from '../../contract/list.ts';
import type { Limit } from '../../contract/module.ts';
import type { ModuleId } from '../../registry.ts';
import type { EntitlementKind } from '../../values/entitlements.ts';
import { SortOrder } from '../../values/list.ts';
import { PackageId } from '../../values/packages.ts';
import { TenantSortKey, type UsageKey } from './values.ts';

// Request schemas and response shapes of /api/platform (PL-01 to PL-04).

const name = z.string().trim().min(1).max(120);

export const CreateTenant = z.object({
  name,
  package: z.enum(PackageId),
  adminEmail: z.email().max(254),
});
export type CreateTenant = z.infer<typeof CreateTenant>;

export const UpdateTenant = z.object({ name, package: z.enum(PackageId) }).partial();
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

export type { UsageKey };

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
  /** ISO instant the tenant org was created. */
  createdAt: string;
  usage: TenantUsage;
}

/** `GET /tenants` (PL-04): search by name, filter by package, sort by name or creation. */
export const TenantListQuery = defineList({
  sort: TenantSortKey,
  defaultSort: TenantSortKey.name,
  defaultOrder: SortOrder.asc,
  facets: { package: PackageId },
});

export interface TenantList extends ListPage<TenantSummary> {
  /** Per package, the tenants that match the search, ignoring the package filter. */
  facets: { package: Record<PackageId, number> };
}

export interface EntitlementView {
  key: string;
  module: ModuleId;
  kind: EntitlementKind;
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
    kind: EntitlementKind;
    soft: boolean;
    value: boolean | Limit;
  }[];
}

export interface PackageList {
  items: PackageView[];
}
