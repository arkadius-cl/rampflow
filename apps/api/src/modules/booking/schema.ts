import {
  BOOKING_STATUSES,
  type BookingStatus,
  DOCK_HOLDING_STATUSES,
  LOAD_STATUSES,
  TURN_AWAY_REASONS,
} from '@rampflow/shared/modules/booking/lifecycle';
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  type BookingId,
  type CarrierId,
  createdAt,
  type DockId,
  instant,
  oneOf,
  primaryId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../../db/ids.ts';
import { allow, and, bookingIs, carrierOwnedPolicies, lockOnly, tenantIs } from '../../db/rls.ts';
import { appUser, dock, org, siteForeignKey } from '../core/schema.ts';
import {
  bookableResource,
  DIRECTIONS,
  type LoadTypeId,
  loadType,
  type ResourceId,
} from './schema.resources.ts';

export {
  BOOKING_STATUSES,
  type BookingStatus,
  DOCK_HOLDING_STATUSES,
  LOAD_STATUSES,
  TURN_AWAY_REASONS,
};

const inStatuses = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** The booking and its visit. No personal data; that lives in `avis`. */
export const booking = pgTable(
  'booking',
  {
    id: primaryId<'booking'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    resourceId: uuid('resource_id').$type<ResourceId>().notNull(),
    loadTypeId: uuid('load_type_id').$type<LoadTypeId>().notNull(),
    carrierId: uuid('carrier_id')
      .$type<CarrierId>()
      .references(() => org.id),
    carrierName: text('carrier_name').notNull(),
    code: char('code', { length: 8 }).notNull(),
    status: text('status', { enum: BOOKING_STATUSES }).notNull(),
    direction: text('direction', { enum: DIRECTIONS }).notNull(),
    startsAt: instant('starts_at').notNull(),
    endsAt: instant('ends_at').notNull(),
    blocksUntil: instant('blocks_until').notNull(),
    siteTimeZone: text('site_time_zone').notNull(),
    loadUnits: integer('load_units').notNull(),
    createdParty: text('created_party', { enum: ['carrier', 'staff'] }).notNull(),
    createdBy: uuid('created_by')
      .$type<UserId>()
      .references(() => appUser.id),
    clientRequestId: uuid('client_request_id'),
    forced: boolean('forced').notNull().default(false),
    walkIn: boolean('walk_in').notNull().default(false),
    dockId: uuid('dock_id').$type<DockId>(),
    punctuality: text('punctuality', { enum: ['early', 'on_time', 'late'] }),
    punctualityMinutes: integer('punctuality_minutes'),
    checkedInAt: instant('checked_in_at'),
    calledAt: instant('called_at'),
    atDockAt: instant('at_dock_at'),
    loadingAt: instant('loading_at'),
    doneAt: instant('done_at'),
    departedAt: instant('departed_at'),
    cancelledAt: instant('cancelled_at'),
    noShowAt: instant('no_show_at'),
    turnedAwayAt: instant('turned_away_at'),
    actualLoadUnits: integer('actual_load_units'),
    discrepancyNote: text('discrepancy_note'),
    cancelReason: text('cancel_reason'),
    cancelledLate: boolean('cancelled_late').notNull().default(false),
    departureReason: text('departure_reason'),
    turnAwayReason: text('turn_away_reason', { enum: TURN_AWAY_REASONS }),
    version: integer('version').notNull().default(1),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    siteForeignKey(t),
    foreignKey({
      columns: [t.resourceId, t.siteId],
      foreignColumns: [bookableResource.id, bookableResource.siteId],
    }),
    foreignKey({
      columns: [t.loadTypeId, t.siteId],
      foreignColumns: [loadType.id, loadType.siteId],
    }),
    foreignKey({ columns: [t.dockId, t.siteId], foreignColumns: [dock.id, dock.siteId] }),
    unique('booking_tenant_code_key').on(t.tenantId, t.code),
    unique('booking_id_tenant_key').on(t.id, t.tenantId),
    uniqueIndex('booking_client_request_key')
      .on(t.createdBy, t.clientRequestId)
      .where(sql`${t.clientRequestId} is not null`),
    uniqueIndex('booking_dock_occupied')
      .on(t.dockId)
      .where(sql`${t.status} in (${inStatuses(DOCK_HOLDING_STATUSES)})`),
    index('booking_resource_load_idx')
      .on(t.resourceId, t.startsAt)
      .where(sql`${t.status} in (${inStatuses(LOAD_STATUSES)})`),
    index('booking_tenant_site_starts_idx').on(t.tenantId, t.siteId, t.startsAt),
    index('booking_site_id_idx').on(t.siteId),
    index('booking_carrier_starts_idx').on(t.carrierId, t.startsAt),
    index('booking_confirmed_idx')
      .on(t.tenantId, t.status, t.startsAt)
      .where(sql`${t.status} = 'confirmed'`),
    check('booking_status_check', oneOf(t.status, BOOKING_STATUSES)),
    check('booking_direction_check', oneOf(t.direction, DIRECTIONS)),
    check('booking_created_party_check', oneOf(t.createdParty, ['carrier', 'staff'])),
    check('booking_punctuality_check', oneOf(t.punctuality, ['early', 'on_time', 'late'])),
    check('booking_turn_away_reason_check', oneOf(t.turnAwayReason, TURN_AWAY_REASONS)),
    check(
      'booking_window_check',
      sql`${t.startsAt} < ${t.endsAt} and ${t.endsAt} <= ${t.blocksUntil}`,
    ),
    check(
      'booking_dock_check',
      sql`${t.dockId} is not null or ${t.status} not in (${inStatuses(DOCK_HOLDING_STATUSES)})`,
    ),
    ...carrierOwnedPolicies({ ...t, bookingId: t.id }, { update: true, driver: true }),
    lockOnly('driver', bookingIs(t.id)),
  ],
);

export const ACTOR_PARTIES = ['carrier', 'tenant', 'driver', 'system'] as const;

/** Append-only history of a booking (ADR-0005). */
export const bookingEvent = pgTable(
  'booking_event',
  {
    id: primaryId<'booking_event'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    bookingId: uuid('booking_id').$type<BookingId>().notNull(),
    carrierId: uuid('carrier_id').$type<CarrierId>(),
    type: text('type').notNull(),
    fromStatus: text('from_status', { enum: BOOKING_STATUSES }),
    toStatus: text('to_status', { enum: BOOKING_STATUSES }),
    at: instant('at').notNull(),
    actorParty: text('actor_party', { enum: ACTOR_PARTIES }).notNull(),
    actorUserId: uuid('actor_user_id').$type<UserId>(),
    actorJob: text('actor_job'),
    data: jsonb('data').notNull().default({}),
  },
  (t) => [
    foreignKey({
      columns: [t.bookingId, t.tenantId],
      foreignColumns: [booking.id, booking.tenantId],
    }).onDelete('cascade'),
    index('booking_event_booking_at_idx').on(t.bookingId, t.at),
    index('booking_event_tenant_id_idx').on(t.tenantId),
    index('booking_event_site_id_idx').on(t.siteId),
    index('booking_event_carrier_id_idx').on(t.carrierId),
    check('booking_event_actor_party_check', oneOf(t.actorParty, ACTOR_PARTIES)),
    ...carrierOwnedPolicies(t, { update: false, driver: true }),
    allow('driver', 'insert', and(tenantIs(t.tenantId), bookingIs(t.bookingId))),
  ],
);
