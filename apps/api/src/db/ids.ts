import { createHash } from 'node:crypto';
import { type SQL, sql } from 'drizzle-orm';
import { type AnyPgColumn, customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import * as z from 'zod';

/** A UUID that names one kind of entity. Parse path and body ids with `idSchema`. */
export type Id<E extends string> = string & z.$brand<E>;

export type OrgId = Id<'org'>;
export type TenantId = Id<'tenant'>;
export type CarrierId = Id<'carrier'>;
/** Any `org.id`: the platform org, a tenant or a carrier. */
export type AnyOrgId = OrgId | TenantId | CarrierId;
export type UserId = Id<'user'>;
export type MembershipId = Id<'membership'>;
export type InvitationId = Id<'invitation'>;
export type SiteId = Id<'site'>;
export type HallId = Id<'hall'>;
export type DockId = Id<'dock'>;
export type BookingId = Id<'booking'>;
export type OutboxMessageId = Id<'outbox_message'>;

export const idSchema = <E extends string>() => z.uuid().brand<E>();

/** `sha256(token)`. The database stores only this, never the token. */
export type TokenHash = Buffer & z.$brand<'token_hash'>;

export function hashToken(token: string): TokenHash {
  return createHash('sha256').update(token).digest() as TokenHash;
}

/**
 * A jsonb value that may itself be JSON `null` (an unlimited limit, a cleared setting).
 * Drizzle writes JS `null` as SQL NULL, so the value travels wrapped as `{ "v": value }`.
 */
export interface JsonValue {
  v: unknown;
}

export const wrapJson = (v: unknown): JsonValue => ({ v });

export const isWrappedJson = (column: AnyPgColumn): SQL =>
  sql`jsonb_typeof(${column}) = 'object' and ${column} ? 'v'`;

/** `id uuid primary key default uuidv7()`, typed as the entity's branded id. */
export const primaryId = <E extends string>() =>
  uuid('id').$type<Id<E>>().primaryKey().default(sql`uuidv7()`);

/** A UTC instant (ADR-0012). */
export const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () => instant('created_at').notNull().defaultNow();

/** `column in ('a', 'b')` for text enumerations, which stay `text` plus a check (data model). */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  for (const v of values) if (!/^[a-z0-9_]+$/.test(v)) throw new Error(`Bad enum value ${v}`);
  return sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`;
}

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});
