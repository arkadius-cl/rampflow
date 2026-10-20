import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@rampflow/shared';
import { ActorParty } from '@rampflow/shared/modules/booking/values';
import type { DriverChannel } from '@rampflow/shared/modules/driver/values';
import type { SystemActorName } from '@rampflow/shared/values';
import { OrgKind } from '@rampflow/shared/values';
import { sql } from 'drizzle-orm';
import type { BookingId, CarrierId, SiteId, TenantId, TokenHash, UserId } from './ids.ts';
import { db, type Tx } from './pool.ts';

export type { Tx } from './pool.ts';

export type TenantRole = Extract<
  Role,
  'tenant_admin' | 'dispatcher' | 'gate_operator' | 'dock_operator'
>;
export type CarrierRole = Extract<Role, 'carrier_admin' | 'carrier_user'>;

export type TenantActor =
  | { kind: 'user'; userId: UserId; role: TenantRole }
  | { kind: 'system'; job: SystemActorName };

/** Who a database transaction acts for (ADR-0002). RLS policies read it through `app.*()`. */
export type Scope =
  | { party: 'anonymous' }
  | { party: 'user'; userId: UserId }
  | { party: 'platform'; userId: UserId }
  | {
      party: 'tenant';
      tenantId: TenantId;
      siteIds: readonly SiteId[] | 'all';
      actor: TenantActor;
    }
  | { party: 'carrier'; carrierId: CarrierId; userId: UserId; role: CarrierRole }
  | {
      party: 'carrier_at_tenant';
      carrierId: CarrierId;
      tenantId: TenantId;
      userId: UserId;
      role: CarrierRole;
    }
  | { party: 'driver'; tenantId: TenantId; bookingId: BookingId; channel: DriverChannel }
  | { party: 'token'; tokenHash: TokenHash; userId: UserId | null }
  | { party: 'public'; tenantId: TenantId; siteId: SiteId | null }
  | { party: 'system'; job: SystemActorName };

export interface SessionVariables {
  party: string;
  user_id: string;
  tenant_id: string;
  carrier_id: string;
  site_ids: string;
  booking_id: string;
  token_hash: string;
}

const EMPTY: SessionVariables = {
  party: '',
  user_id: '',
  tenant_id: '',
  carrier_id: '',
  site_ids: '',
  booking_id: '',
  token_hash: '',
};

/** Pure: the `app.*` settings for a scope. Unset variables are '' and read as NULL. */
export function sessionVariables(scope: Scope): SessionVariables {
  const v = { ...EMPTY, party: scope.party };
  switch (scope.party) {
    case 'anonymous':
    case ActorParty.system:
      return v;
    case 'user':
    case OrgKind.platform:
      return { ...v, user_id: scope.userId };
    case ActorParty.tenant:
      return {
        ...v,
        tenant_id: scope.tenantId,
        user_id: scope.actor.kind === 'user' ? scope.actor.userId : '',
        site_ids: scope.siteIds === 'all' ? '*' : scope.siteIds.join(','),
      };
    case ActorParty.carrier:
      return { ...v, carrier_id: scope.carrierId, user_id: scope.userId };
    case 'carrier_at_tenant':
      return {
        ...v,
        carrier_id: scope.carrierId,
        tenant_id: scope.tenantId,
        user_id: scope.userId,
      };
    case ActorParty.driver:
      return { ...v, tenant_id: scope.tenantId, booking_id: scope.bookingId };
    case 'token':
      return { ...v, token_hash: scope.tokenHash.toString('hex'), user_id: scope.userId ?? '' };
    case 'public':
      return { ...v, tenant_id: scope.tenantId };
  }
}

export function applyScope(tx: Tx, scope: Scope): Promise<void> {
  return setVariables(tx, sessionVariables(scope));
}

async function setVariables(tx: Tx, v: SessionVariables): Promise<void> {
  await tx.execute(sql`select
    set_config('app.party', ${v.party}, true),
    set_config('app.user_id', ${v.user_id}, true),
    set_config('app.tenant_id', ${v.tenant_id}, true),
    set_config('app.carrier_id', ${v.carrier_id}, true),
    set_config('app.site_ids', ${v.site_ids}, true),
    set_config('app.booking_id', ${v.booking_id}, true),
    set_config('app.token_hash', ${v.token_hash}, true)`);
}

const openScope = new AsyncLocalStorage<true>();

/**
 * Runs `fn` in one transaction whose RLS scope is `scope`. Nothing outlives the transaction.
 * Opening a second scoped transaction inside one would take a second pool connection and
 * commit independently of the outer rollback, so it throws; use `asScope` instead.
 */
export function withScope<T>(scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (openScope.getStore()) {
    throw new Error('withScope inside a scoped transaction; switch with asScope(tx, scope, fn)');
  }
  return openScope.run(true, () =>
    db.transaction(async (tx) => {
      await applyScope(tx, scope);
      return fn(tx);
    }),
  );
}

/**
 * Switches the RLS scope of the current transaction for `fn`, then restores the previous one.
 * Token redemption uses it to claim the token and write the membership atomically (ADR-0002).
 */
export async function asScope<T>(tx: Tx, scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { rows } = await tx.execute<Record<keyof SessionVariables, string | null>>(sql`select
    current_setting('app.party', true) as party,
    current_setting('app.user_id', true) as user_id,
    current_setting('app.tenant_id', true) as tenant_id,
    current_setting('app.carrier_id', true) as carrier_id,
    current_setting('app.site_ids', true) as site_ids,
    current_setting('app.booking_id', true) as booking_id,
    current_setting('app.token_hash', true) as token_hash`);
  const restore = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as (keyof SessionVariables)[]) {
    restore[key] = rows[0]?.[key] ?? '';
  }
  await setVariables(tx, sessionVariables(scope));
  let result: T;
  try {
    result = await fn(tx);
  } catch (e) {
    // After a database error the transaction is aborted and rolls back anyway.
    await setVariables(tx, restore).catch(() => undefined);
    throw e;
  }
  await setVariables(tx, restore);
  return result;
}
