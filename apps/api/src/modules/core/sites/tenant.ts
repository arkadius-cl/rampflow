import type { Entitlements } from '@rampflow/shared';
import type { ConflictReason } from '@rampflow/shared/values';
import { ErrorCode, ScopeParty, TenantActorKind } from '@rampflow/shared/values';
import type { Context } from 'hono';
import type { TenantId, UserId } from '../../../db/ids.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';

/** The tenant, acting user and entitlements of a request under `/api/t/:orgId`. */
export interface TenantRequest {
  tenantId: TenantId;
  userId: UserId | null;
  entitlements: Entitlements;
}

export function tenantRequest(c: Context<AppEnv>): TenantRequest {
  const { scope, access } = c.var;
  if (scope.party !== ScopeParty.tenant || !access.entitlements) {
    throw new Error(`tenant route under party ${scope.party}`);
  }
  return {
    tenantId: scope.tenantId,
    userId: scope.actor.kind === TenantActorKind.user ? scope.actor.userId : null,
    entitlements: access.entitlements,
  };
}

/** Postgres SQLSTATE of an error thrown by a query, looking through Drizzle's wrapper. */
function pgError(e: unknown): { code?: string; constraint?: string } | null {
  for (let cur = e; cur && typeof cur === 'object'; cur = (cur as { cause?: unknown }).cause) {
    if ('code' in cur && typeof cur.code === 'string' && /^[0-9A-Z]{5}$/.test(cur.code)) {
      return cur as { code: string; constraint?: string };
    }
  }
  return null;
}

/** Rethrows a unique violation of `constraint` as 409 `conflict` with `reason`. */
export function conflictOnUnique(e: unknown, constraint: string, reason: ConflictReason): never {
  const pg = pgError(e);
  if (pg?.code === '23505' && pg.constraint === constraint) {
    throw new ApiError(ErrorCode.conflict, `Conflict: ${reason}`, { reason });
  }
  throw e;
}

/** 422 with one zod-shaped issue, for rules that need stored data. */
export function invalid(path: (string | number)[], message: string): ApiError {
  return new ApiError(ErrorCode.validation_failed, 'Invalid json', {
    issues: [{ path, code: 'custom', message }],
  });
}
