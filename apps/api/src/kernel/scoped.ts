import { TenantStatus } from '@rampflow/shared/modules/core/values';
import { ErrorCode, ScopeParty, TenantActorKind } from '@rampflow/shared/values';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { type Scope, withScope } from '../db/scope.ts';
import { type Access, loadAccess } from './access.ts';
import type { AppEnv } from './env.ts';
import { ApiError } from './errors.ts';

const ROLLBACK = Symbol('rollback');

export type ScopeResolver = (c: Context<AppEnv>) => Promise<Scope>;

/**
 * A suspended tenant refuses its staff and the carriers acting at it with 403, and its drivers
 * with 401, which the driver PWA shows as an invalid link (ADR-0018). The platform, the
 * cross-tenant carrier party and public links (`openPublicLink`) are handled elsewhere.
 */
function refuseSuspended(scope: Scope, access: Access): void {
  if (access.tenantStatus !== TenantStatus.suspended) return;
  switch (scope.party) {
    case ScopeParty.tenant:
      if (scope.actor.kind === TenantActorKind.user) throw new ApiError(ErrorCode.tenant_suspended);
      return;
    case ScopeParty.carrier_at_tenant:
      throw new ApiError(ErrorCode.tenant_suspended);
    case ScopeParty.driver:
      throw new ApiError(ErrorCode.unauthorized);
    default:
      return;
  }
}

/**
 * Runs the rest of the request in one transaction under the resolved scope (ADR-0002).
 * Any error or any response with status >= 400 rolls back, so a 409 after a partial write
 * commits nothing. Mount once per area.
 */
export const scoped = (resolve: ScopeResolver) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const scope = await resolve(c);
    await withScope(scope, async (tx) => {
      c.set('scope', scope);
      c.set('db', tx);
      const access = await loadAccess(tx, scope, c.var.clock);
      refuseSuspended(scope, access);
      c.set('access', access);
      await next();
      if (c.error || c.res.status >= 400) throw ROLLBACK;
    }).catch((e: unknown) => {
      if (e !== ROLLBACK) throw e;
    });
  });
