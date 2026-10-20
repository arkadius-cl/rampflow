import type { Entitlements } from '@rampflow/shared';
import { ActorParty } from '@rampflow/shared/modules/booking/values';
import type { Context } from 'hono';
import type { TenantId, UserId } from '../../../db/ids.ts';
import type { AppEnv } from '../../../kernel/env.ts';

export interface TenantActor {
  tenantId: TenantId;
  userId: UserId | null;
  entitlements: Entitlements;
}

/** Tenant, user and entitlements of a `/t/:orgId` request; the scope middleware guarantees them. */
export function tenantActor(c: Context<AppEnv>): TenantActor {
  const { scope, access } = c.var;
  if (scope.party !== ActorParty.tenant || !access.entitlements) {
    throw new Error(`safety tenant route under ${scope.party} scope`);
  }
  return {
    tenantId: scope.tenantId,
    userId: scope.actor.kind === 'user' ? scope.actor.userId : null,
    entitlements: access.entitlements,
  };
}
