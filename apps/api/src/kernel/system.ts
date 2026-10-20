import type { SystemActorName } from '@rampflow/shared/values';
import { ScopeParty, TenantActorKind } from '@rampflow/shared/values';
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
