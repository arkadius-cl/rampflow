import { ReferenceType } from '@rampflow/shared/modules/avis/values';
import { values } from '@rampflow/shared/values';
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  type BookingId,
  type CarrierId,
  createdAt,
  instant,
  oneOf,
  primaryId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../../db/ids.ts';
import { carrierOwnedPolicies } from '../../db/rls.ts';
import { booking } from '../booking/schema.ts';

/** One per booking (AV-01). Holds the visit's personal data, so the driver party cannot read it. */
export const avis = pgTable(
  'avis',
  {
    bookingId: uuid('booking_id').$type<BookingId>().primaryKey(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    carrierId: uuid('carrier_id').$type<CarrierId>(),
    counterpartyName: text('counterparty_name').notNull(),
    loadUnits: jsonb('load_units').notNull(),
    palletPositions: integer('pallet_positions'),
    grossWeightKg: numeric('gross_weight_kg', { precision: 8, scale: 1 }),
    palletExchange: boolean('pallet_exchange'),
    vehicleType: text('vehicle_type'),
    plate: text('plate'),
    plateCountry: char('plate_country', { length: 2 }),
    trailerPlate: text('trailer_plate'),
    driverName: text('driver_name'),
    driverPhone: text('driver_phone'),
    driverLocale: text('driver_locale'),
    dangerousGoods: jsonb('dangerous_goods').notNull().default({ present: false }),
    temperature: jsonb('temperature').notNull().default({ controlled: false }),
    notes: text('notes'),
    plateSeen: text('plate_seen'),
    phoneErasedAt: instant('phone_erased_at'),
    pseudonymizedAt: instant('pseudonymized_at'),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by').$type<UserId>(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.bookingId, t.tenantId],
      foreignColumns: [booking.id, booking.tenantId],
    }).onDelete('cascade'),
    index('avis_tenant_id_idx').on(t.tenantId),
    index('avis_site_id_idx').on(t.siteId),
    index('avis_carrier_id_idx').on(t.carrierId),
    index('avis_tenant_driver_name_idx').on(t.tenantId, sql`lower(${t.driverName})`),
    index('avis_tenant_plate_idx').on(t.tenantId, t.plate),
    index('avis_tenant_driver_phone_idx').on(t.tenantId, t.driverPhone),
    check('avis_notes_length', sql`char_length(${t.notes}) <= 1000`),
    ...carrierOwnedPolicies(t, { update: true, driver: false }),
  ],
);

export const avisReference = pgTable(
  'avis_reference',
  {
    id: primaryId<'avis_reference'>(),
    bookingId: uuid('booking_id').$type<BookingId>().notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    carrierId: uuid('carrier_id').$type<CarrierId>(),
    type: text('type', { enum: values(ReferenceType) }).notNull(),
    value: text('value').notNull(),
    valueNorm: text('value_norm').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.bookingId], foreignColumns: [avis.bookingId] }).onDelete('cascade'),
    index('avis_reference_booking_id_idx').on(t.bookingId),
    index('avis_reference_tenant_value_idx').on(t.tenantId, t.valueNorm),
    index('avis_reference_site_id_idx').on(t.siteId),
    index('avis_reference_carrier_id_idx').on(t.carrierId),
    check('avis_reference_type_check', oneOf(t.type, values(ReferenceType))),
    check('avis_reference_value_length', sql`char_length(${t.value}) between 1 and 35`),
    ...carrierOwnedPolicies(t, { update: true, driver: false }),
  ],
);
