import type { ValueOf } from './define.ts';
import { TenantRole } from './roles.ts';

// The demo data of `pnpm db:seed` (apps/api/scripts/seed).

/** The orgs the demo users belong to: the platform, the tenant ACME and the carrier TransPol. */
export const SeedOrg = {
  platform: 'platform',
  acme: 'acme',
  transpol: 'transpol',
} as const;
export type SeedOrg = ValueOf<typeof SeedOrg>;

/** Who moves a demo booking along its lifecycle: an ACME staff member, or the no-show job. */
export const SeedActor = {
  dispatcher: TenantRole.dispatcher,
  gate_operator: TenantRole.gate_operator,
  dock_operator: TenantRole.dock_operator,
  system: 'system',
} as const;
export type SeedActor = ValueOf<typeof SeedActor>;
