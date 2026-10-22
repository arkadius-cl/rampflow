import type { Entitlements, PermissionKey, Role, SettingKey, SettingSource } from '../../index.ts';
import type { CarrierLinkStatus } from '../booking/values.ts';
import type { TenantStatus } from './values.ts';

// Bodies of the three context endpoints (module contract, "Context endpoints"). The layouts of
// apps/web fetch them once per org and gate routes, navigation and actions from them.

export interface OrgRef {
  id: string;
  name: string;
}

export interface ContextSite {
  id: string;
  name: string;
  timeZone: string;
}

export interface ContextSetting {
  value: unknown;
  source: SettingSource;
}

export interface TenantContext {
  org: OrgRef;
  /** `onboarding` until the first dock exists, then `active` for good (ON-02). */
  status: TenantStatus;
  role: Role;
  permissions: PermissionKey[];
  entitlements: Entitlements;
  /** Active sites the caller may see; gate and dock operators get their assigned sites. */
  sites: ContextSite[];
  /** Per site, every setting available under the tenant's entitlements. */
  settings: Record<string, Partial<Record<SettingKey, ContextSetting>>>;
}

export interface CarrierContextTenant {
  id: string;
  name: string;
  linkStatus: CarrierLinkStatus;
  /** The tenant's `booking.carrier_portal` entitlement; `false` while the tenant is suspended. */
  carrierPortal: boolean;
  /** Suspended by the platform (PL-07): bookings there stay readable, nothing else works. */
  suspended: boolean;
  logoUrl: string | null;
}

export interface CarrierContext {
  org: OrgRef;
  role: Role;
  permissions: PermissionKey[];
  tenants: CarrierContextTenant[];
}

export interface PlatformContext {
  role: Role;
  permissions: PermissionKey[];
}

/** `/api/public/logos/:tenantId/:sha` (TN-05). */
export const logoPath = (tenantId: string, sha256Hex: string) =>
  `/api/public/logos/${tenantId}/${sha256Hex}`;
