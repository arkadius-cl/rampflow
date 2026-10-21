import type { Entitlements } from '@rampflow/shared';
import { ProfileForeignKey, ResourceDockConstraint } from '@rampflow/shared/modules/booking/values';
import {
  ConflictReason,
  ErrorCode,
  isValueOf,
  ScopeParty,
  SqlState,
  TenantActorKind,
  ZodIssueCode,
} from '@rampflow/shared/values';
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
  if (pg?.code === SqlState.unique_violation && pg.constraint === constraint) {
    throw new ApiError(ErrorCode.conflict, `Conflict: ${reason}`, { reason });
  }
  throw e;
}

/** Rethrows a violation of a profile key as 409 `conflict` with `profile_mismatch`. */
export function conflictOnProfile(e: unknown): never {
  const pg = pgError(e);
  if (pg?.code === SqlState.foreign_key_violation && isValueOf(ProfileForeignKey, pg.constraint)) {
    throw new ApiError(ErrorCode.conflict, 'The dock profile differs from the resource', {
      reason: ConflictReason.profile_mismatch,
    });
  }
  throw e;
}

/** A membership insert: the dock taken meanwhile (primary key) or a profile changed meanwhile. */
export function conflictOnMembership(e: unknown): never {
  if (pgError(e)?.code === SqlState.foreign_key_violation) return conflictOnProfile(e);
  return conflictOnUnique(
    e,
    ResourceDockConstraint.resource_dock_pkey,
    ConflictReason.dock_in_resource,
  );
}

/** 422 with one zod-shaped issue, for rules that need stored data. */
export function invalid(path: (string | number)[], message: string): ApiError {
  return new ApiError(ErrorCode.validation_failed, 'Invalid json', {
    issues: [{ path, code: ZodIssueCode.custom, message }],
  });
}
