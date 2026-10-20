import type { ValueOf } from './define.ts';

/** Who a database transaction acts for (ADR-0002); RLS policies read it as `app.party()`. */
export const ScopeParty = {
  anonymous: 'anonymous',
  user: 'user',
  platform: 'platform',
  tenant: 'tenant',
  carrier: 'carrier',
  carrier_at_tenant: 'carrier_at_tenant',
  driver: 'driver',
  token: 'token',
  public: 'public',
  system: 'system',
} as const;
export type ScopeParty = ValueOf<typeof ScopeParty>;

/** The parties of "Areas and parties" in docs/reference/api-routes.md: who calls a route. */
export const ApiParty = {
  anonymous: ScopeParty.anonymous,
  user: ScopeParty.user,
  platform: ScopeParty.platform,
  tenant: ScopeParty.tenant,
  carrier: ScopeParty.carrier,
  carrier_at_tenant: ScopeParty.carrier_at_tenant,
  driver: ScopeParty.driver,
  public: ScopeParty.public,
} as const;
export type ApiParty = ValueOf<typeof ApiParty>;

/** The parties that may read a tenant's reference rows (`tenantPolicies` readers). */
export const PolicyReader = {
  carrier: ScopeParty.carrier,
  carrier_at_tenant: ScopeParty.carrier_at_tenant,
  driver: ScopeParty.driver,
  public: ScopeParty.public,
} as const;
export type PolicyReader = ValueOf<typeof PolicyReader>;

/** The command of a row-level security policy (`for all | select | ...`). */
export const PolicyCommand = {
  all: 'all',
  select: 'select',
  insert: 'insert',
  update: 'update',
  delete: 'delete',
} as const;
export type PolicyCommand = ValueOf<typeof PolicyCommand>;

/** Who acts in a tenant scope: a signed-in user, or a system actor. */
export const TenantActorKind = {
  user: 'user',
  system: 'system',
} as const;
export type TenantActorKind = ValueOf<typeof TenantActorKind>;

/** A tenant scope that sees every site instead of a site list. */
export const SiteAccess = {
  all: 'all',
} as const;
export type SiteAccess = ValueOf<typeof SiteAccess>;
