import type { SystemActorName } from '@rampflow/shared/values';
import { ScopeParty, TenantActorKind } from '@rampflow/shared/values';
import type { UserId } from '../db/ids.ts';
import type { Scope, TenantActor } from '../db/scope.ts';

// Only jobs and token redemption act as the system (biome.json restricts these imports).

/** The actor of a tenant scope that a job or a token redemption opens. */
export function systemActor(job: SystemActorName): TenantActor {
  return { kind: TenantActorKind.system, job };
}

/** Cross-tenant job steps: list tenants, drain the outbox. Sees `org` and `outbox_message` only. */
export function systemScope(job: SystemActorName): Scope {
  return { party: ScopeParty.system, job };
}

/**
 * Platform data no user acts on (carrier accounts, cross-tenant lookups, the tax id check): the
 * platform party with the nil user id.
 */
export const platformSystemScope: Scope = {
  party: ScopeParty.platform,
  userId: '00000000-0000-0000-0000-000000000000' as UserId,
};
