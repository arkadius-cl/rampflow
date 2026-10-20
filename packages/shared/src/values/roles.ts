import type { ValueOf } from './define.ts';

export const Role = {
  platform_admin: 'platform_admin',
  tenant_admin: 'tenant_admin',
  dispatcher: 'dispatcher',
  gate_operator: 'gate_operator',
  dock_operator: 'dock_operator',
  carrier_admin: 'carrier_admin',
  carrier_user: 'carrier_user',
} as const;
export type Role = ValueOf<typeof Role>;

export const TenantRole = {
  tenant_admin: Role.tenant_admin,
  dispatcher: Role.dispatcher,
  gate_operator: Role.gate_operator,
  dock_operator: Role.dock_operator,
} as const;
export type TenantRole = ValueOf<typeof TenantRole>;

export const CarrierRole = {
  carrier_admin: Role.carrier_admin,
  carrier_user: Role.carrier_user,
} as const;
export type CarrierRole = ValueOf<typeof CarrierRole>;

/** Roles that may be limited to a site list. Without one they see every site. */
export const SiteLimitedRole = {
  gate_operator: TenantRole.gate_operator,
  dock_operator: TenantRole.dock_operator,
} as const;
export type SiteLimitedRole = ValueOf<typeof SiteLimitedRole>;

/** The kind of org a membership belongs to. Drivers are not an org party; they hold a booking token. */
export const OrgParty = {
  platform: 'platform',
  tenant: 'tenant',
  carrier: 'carrier',
} as const;
export type OrgParty = ValueOf<typeof OrgParty>;
