import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { values } from '@rampflow/shared/values';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  type BookingId,
  bytea,
  type CarrierId,
  createdAt,
  instant,
  oneOf,
  primaryId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../../db/ids.ts';
import { allow, carrierOwnedPolicies, tokenIs } from '../../db/rls.ts';
import { booking } from '../booking/schema.ts';

/** A driver link or a staff briefing session for one booking (ADR-0008). */
export const driverAccess = pgTable(
  'driver_access',
  {
    id: primaryId<'driver_access'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    bookingId: uuid('booking_id').$type<BookingId>().notNull(),
    carrierId: uuid('carrier_id').$type<CarrierId>(),
    tokenHash: bytea('token_hash').notNull().unique(),
    channel: text('channel', { enum: values(DriverChannel) }).notNull(),
    createdBy: uuid('created_by').$type<UserId>(),
    expiresAt: instant('expires_at').notNull(),
    revokedAt: instant('revoked_at'),
    lastUsedAt: instant('last_used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.bookingId, t.tenantId],
      foreignColumns: [booking.id, booking.tenantId],
    }).onDelete('cascade'),
    uniqueIndex('driver_access_active_link_key')
      .on(t.bookingId)
      .where(sql`${t.channel} = 'link' and ${t.revokedAt} is null`),
    index('driver_access_booking_id_idx').on(t.bookingId),
    index('driver_access_tenant_id_idx').on(t.tenantId),
    index('driver_access_site_id_idx').on(t.siteId),
    index('driver_access_carrier_id_idx').on(t.carrierId),
    check('driver_access_channel_check', oneOf(t.channel, values(DriverChannel))),
    ...carrierOwnedPolicies(t, { update: true, driver: true }),
    allow('token', 'select', tokenIs(t.tokenHash)),
    allow('token', 'update', tokenIs(t.tokenHash)),
  ],
);
