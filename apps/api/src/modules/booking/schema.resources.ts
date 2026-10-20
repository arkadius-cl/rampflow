import type { LoadTypeDuration } from '@rampflow/shared/modules/booking/api.capacity';
import {
  ClosureKind,
  ClosureSource,
  Direction,
  ResourceKind,
} from '@rampflow/shared/modules/booking/values';
import { values } from '@rampflow/shared/values';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  type DockId,
  type Id,
  instant,
  oneOf,
  primaryId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../../db/ids.ts';
import { tenantPolicies } from '../../db/rls.ts';
import { dock, siteForeignKey } from '../core/schema.ts';

export type ResourceId = Id<'resource'>;
export type LoadTypeId = Id<'load_type'>;

export type { LoadTypeDuration };

/** A single dock or a pool of docks that bookings are planned on (MD-03). */
export const bookableResource = pgTable(
  'bookable_resource',
  {
    id: primaryId<'resource'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    kind: text('kind', { enum: values(ResourceKind) }).notNull(),
    name: text('name').notNull(),
    directions: text('directions', { enum: values(Direction) })
      .array()
      .notNull(),
    capacityCap: integer('capacity_cap'),
    dailyCap: integer('daily_cap'),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    siteForeignKey(t),
    unique('bookable_resource_id_kind_key').on(t.id, t.kind),
    unique('bookable_resource_id_site_key').on(t.id, t.siteId),
    index('bookable_resource_tenant_id_idx').on(t.tenantId),
    index('bookable_resource_site_id_idx').on(t.siteId),
    check('bookable_resource_kind_check', oneOf(t.kind, values(ResourceKind))),
    check(
      'bookable_resource_directions_check',
      sql`cardinality(${t.directions}) >= 1 and ${t.directions} <@ array['inbound', 'outbound']::text[]`,
    ),
    check(
      'bookable_resource_capacity_cap_check',
      sql`${t.capacityCap} is null or (${t.kind} = 'pool' and ${t.capacityCap} >= 1)`,
    ),
    check('bookable_resource_daily_cap_check', sql`${t.dailyCap} is null or ${t.dailyCap} >= 1`),
    ...tenantPolicies(t, { site: t.siteId, readers: ['carrier', 'carrier_at_tenant', 'driver'] }),
  ],
);

export const resourceDock = pgTable(
  'resource_dock',
  {
    dockId: uuid('dock_id').$type<DockId>().primaryKey(),
    resourceId: uuid('resource_id').$type<ResourceId>().notNull(),
    resourceKind: text('resource_kind', { enum: values(ResourceKind) }).notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.resourceId, t.resourceKind],
      foreignColumns: [bookableResource.id, bookableResource.kind],
    }).onDelete('cascade'),
    foreignKey({ columns: [t.dockId, t.siteId], foreignColumns: [dock.id, dock.siteId] }),
    foreignKey({
      columns: [t.resourceId, t.siteId],
      foreignColumns: [bookableResource.id, bookableResource.siteId],
    }),
    uniqueIndex('resource_dock_single_key')
      .on(t.resourceId)
      .where(sql`${t.resourceKind} = 'single'`),
    index('resource_dock_resource_id_idx').on(t.resourceId),
    index('resource_dock_tenant_id_idx').on(t.tenantId),
    index('resource_dock_site_id_idx').on(t.siteId),
    ...tenantPolicies(t, { site: t.siteId, readers: ['carrier_at_tenant'] }),
  ],
);

/** Weekly hours in local wall time (ADR-0012). `resource_id` null: site hours. */
export const openingHours = pgTable(
  'opening_hours',
  {
    id: primaryId<'opening_hours'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    resourceId: uuid('resource_id').$type<ResourceId>(),
    weekday: smallint('weekday').notNull(),
    opens: time('opens').notNull(),
    closes: time('closes').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    siteForeignKey(t),
    foreignKey({
      columns: [t.resourceId, t.siteId],
      foreignColumns: [bookableResource.id, bookableResource.siteId],
    }).onDelete('cascade'),
    index('opening_hours_tenant_id_idx').on(t.tenantId),
    index('opening_hours_site_id_idx').on(t.siteId),
    index('opening_hours_resource_id_idx').on(t.resourceId),
    check('opening_hours_weekday_check', sql`${t.weekday} between 1 and 7`),
    check('opening_hours_window_check', sql`${t.opens} < ${t.closes}`),
    ...tenantPolicies(t, { site: t.siteId, readers: ['carrier_at_tenant'] }),
  ],
);

export const closure = pgTable(
  'closure',
  {
    id: primaryId<'closure'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    resourceId: uuid('resource_id').$type<ResourceId>(),
    kind: text('kind', { enum: values(ClosureKind) }).notNull(),
    startsLocal: timestamp('starts_local', { mode: 'string' }).notNull(),
    endsLocal: timestamp('ends_local', { mode: 'string' }).notNull(),
    reason: text('reason'),
    source: text('source', { enum: values(ClosureSource) }).notNull(),
    holidayDate: date('holiday_date', { mode: 'string' }),
    holidayName: text('holiday_name'),
    reopenedAt: instant('reopened_at'),
    createdBy: uuid('created_by').$type<UserId>(),
    createdAt: createdAt(),
  },
  (t) => [
    siteForeignKey(t),
    foreignKey({
      columns: [t.resourceId, t.siteId],
      foreignColumns: [bookableResource.id, bookableResource.siteId],
    }).onDelete('cascade'),
    uniqueIndex('closure_holiday_key')
      .on(t.siteId, t.holidayDate)
      .where(sql`${t.source} = 'holiday'`),
    index('closure_site_starts_idx').on(t.siteId, t.startsLocal),
    index('closure_tenant_id_idx').on(t.tenantId),
    index('closure_resource_id_idx').on(t.resourceId),
    check('closure_kind_check', oneOf(t.kind, values(ClosureKind))),
    check('closure_source_check', oneOf(t.source, values(ClosureSource))),
    check('closure_window_check', sql`${t.startsLocal} < ${t.endsLocal}`),
    check(
      'closure_holiday_date_check',
      sql`(${t.source} = 'holiday') = (${t.holidayDate} is not null)`,
    ),
    ...tenantPolicies(t, { site: t.siteId, readers: ['carrier_at_tenant'] }),
  ],
);

export const loadType = pgTable(
  'load_type',
  {
    id: primaryId<'load_type'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    name: jsonb('name').$type<{ de: string; en: string }>().notNull(),
    direction: text('direction', { enum: values(Direction) }).notNull(),
    duration: jsonb('duration').$type<LoadTypeDuration>().notNull(),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    carrierBookable: boolean('carrier_bookable').notNull().default(true),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    siteForeignKey(t),
    unique('load_type_id_site_key').on(t.id, t.siteId),
    index('load_type_tenant_id_idx').on(t.tenantId),
    index('load_type_site_id_idx').on(t.siteId),
    check('load_type_direction_check', oneOf(t.direction, values(Direction))),
    check('load_type_buffer_check', sql`${t.bufferMinutes} between 0 and 240`),
    ...tenantPolicies(t, { site: t.siteId, readers: ['carrier', 'carrier_at_tenant', 'driver'] }),
  ],
);

export const loadTypeResource = pgTable(
  'load_type_resource',
  {
    loadTypeId: uuid('load_type_id').$type<LoadTypeId>().notNull(),
    resourceId: uuid('resource_id').$type<ResourceId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.loadTypeId, t.resourceId] }),
    foreignKey({
      columns: [t.loadTypeId, t.siteId],
      foreignColumns: [loadType.id, loadType.siteId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.resourceId, t.siteId],
      foreignColumns: [bookableResource.id, bookableResource.siteId],
    }).onDelete('cascade'),
    index('load_type_resource_resource_id_idx').on(t.resourceId),
    index('load_type_resource_tenant_id_idx').on(t.tenantId),
    index('load_type_resource_site_id_idx').on(t.siteId),
    ...tenantPolicies(t, { site: t.siteId, readers: ['carrier_at_tenant'] }),
  ],
);
