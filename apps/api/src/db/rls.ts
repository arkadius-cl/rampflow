import { ActorParty } from '@rampflow/shared/modules/booking/values';
import { type SQL, sql } from 'drizzle-orm';
import { type AnyPgColumn, type PgPolicy, pgPolicy } from 'drizzle-orm/pg-core';
import type { Scope } from './scope.ts';

// Policy builders for the classes in docs/reference/data-model.md ("Policy classes").
// Every policy names its party, because tenant, carrier_at_tenant, driver and public scopes
// all set app.tenant_id() and must not inherit each other's rights.

export type Party = Scope['party'];
export type Command = 'all' | 'select' | 'insert' | 'update' | 'delete';

const PARTY_PATTERN = /^[a-z_]+$/;

export function isParty(party: Party): SQL {
  if (!PARTY_PATTERN.test(party)) throw new Error(`Invalid party ${party}`);
  return sql.raw(`(select app.party()) = '${party}'`);
}

export const tenantIs = (column: AnyPgColumn): SQL => sql`${column} = (select app.tenant_id())`;
export const carrierIs = (column: AnyPgColumn): SQL => sql`${column} = (select app.carrier_id())`;
export const userIs = (column: AnyPgColumn): SQL => sql`${column} = (select app.user_id())`;
export const bookingIs = (column: AnyPgColumn): SQL => sql`${column} = (select app.booking_id())`;
export const tokenIs = (column: AnyPgColumn): SQL => sql`${column} = (select app.token_hash())`;
export const siteAllowed = (column: AnyPgColumn): SQL => sql`app.site_allowed(${column})`;
export const sharesOrg = (column: AnyPgColumn): SQL => sql`app.shares_org(${column})`;
export const linkedTenant = (column: AnyPgColumn): SQL => sql`app.linked_tenant(${column})`;
export const always: SQL = sql`true`;

export function and(...parts: SQL[]): SQL {
  return sql.join(
    parts.map((p) => sql`(${p})`),
    sql` and `,
  );
}

/**
 * One permissive policy `<party>_<command>` for one party. `using` filters visible rows;
 * `check` (default: the same condition) constrains written rows.
 */
export function allow(
  party: Party,
  command: Command,
  using: SQL,
  check: SQL = using,
  suffix = '',
): PgPolicy {
  const condition = and(isParty(party), using);
  const checked = and(isParty(party), check);
  const name = `${party}_${command}${suffix ? `_${suffix}` : ''}`;
  switch (command) {
    case 'select':
    case 'delete':
      return pgPolicy(name, { for: command, using: condition });
    case 'insert':
      return pgPolicy(name, { for: command, withCheck: checked });
    case 'update':
    case 'all':
      return pgPolicy(name, { for: command, using: condition, withCheck: checked });
  }
}

export type Reader = 'carrier' | 'carrier_at_tenant' | 'driver' | 'public';

export interface TenantColumns {
  tenantId: AnyPgColumn;
}

/**
 * `tenant-private` (no readers) and `tenant-reference(readers)`. With `site`, the tenant
 * party sees only rows of its allowed sites (gate and dock operators, TN-01).
 */
export function tenantPolicies(
  t: TenantColumns,
  o: { site: AnyPgColumn | null; readers: readonly Reader[] },
): PgPolicy[] {
  const own = o.site ? and(tenantIs(t.tenantId), siteAllowed(o.site)) : tenantIs(t.tenantId);
  return [
    allow(ActorParty.tenant, 'all', own),
    ...o.readers.map((reader) =>
      allow(
        reader,
        'select',
        reader === 'carrier' ? linkedTenant(t.tenantId) : tenantIs(t.tenantId),
      ),
    ),
  ];
}

export interface BookingFamilyColumns {
  tenantId: AnyPgColumn;
  carrierId: AnyPgColumn;
  siteId: AnyPgColumn;
  /** `id` on `booking`, `booking_id` on its children. */
  bookingId: AnyPgColumn;
}

/**
 * `booking-family`: the tenant sees its allowed sites; a carrier, at every tenant or acting at
 * one tenant, sees and writes only its own rows; a driver reads the one booking of its token.
 * Other carriers' load reaches a carrier only through the capacity read of ADR-0004 (`asScope`).
 * Without `update` (append-only tables) the tenant may select, insert and delete.
 */
export function carrierOwnedPolicies(
  t: BookingFamilyColumns,
  o: { update: boolean; driver: boolean },
): PgPolicy[] {
  const tenant = and(tenantIs(t.tenantId), siteAllowed(t.siteId));
  const own = and(tenantIs(t.tenantId), carrierIs(t.carrierId));
  return [
    ...(o.update
      ? [allow(ActorParty.tenant, 'all', tenant)]
      : (['select', 'insert', 'delete'] as const).map((cmd) =>
          allow(ActorParty.tenant, cmd, tenant),
        )),
    allow(ActorParty.carrier, 'select', carrierIs(t.carrierId)),
    allow('carrier_at_tenant', 'select', own),
    allow('carrier_at_tenant', 'insert', own),
    ...(o.update ? [allow('carrier_at_tenant', 'update', own)] : []),
    ...(o.driver ? [allow(ActorParty.driver, 'select', bookingIs(t.bookingId))] : []),
  ];
}

/** `select ... for update` without the right to change the row: update policy with check false. */
export const lockOnly = (party: Party, using: SQL): PgPolicy =>
  allow(party, 'update', using, sql`false`, 'lock');
