import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  type BookingId,
  bytea,
  type CarrierId,
  createdAt,
  type Id,
  instant,
  oneOf,
  primaryId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../../db/ids.ts';
import { allow, and, bookingIs, siteAllowed, tenantIs, tenantPolicies } from '../../db/rls.ts';
import { booking } from '../booking/schema.ts';
import { appUser, org, siteForeignKey } from '../core/schema.ts';

export type InstructionId = Id<'safety_instruction'>;
export type VersionId = Id<'safety_version'>;
export type AcknowledgementId = Id<'safety_acknowledgement'>;

export const safetyInstruction = pgTable(
  'safety_instruction',
  {
    id: primaryId<'safety_instruction'>(),
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .notNull()
      .references(() => org.id),
    name: text('name').notNull(),
    allSites: boolean('all_sites').notNull().default(true),
    archivedAt: instant('archived_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('safety_instruction_id_tenant_key').on(t.id, t.tenantId),
    index('safety_instruction_tenant_id_idx').on(t.tenantId),
    ...tenantPolicies(t, { site: null, readers: ['driver'] }),
  ],
);

const instructionRef = (t: { instructionId: AnyPgColumn; tenantId: AnyPgColumn }) =>
  foreignKey({
    columns: [t.instructionId, t.tenantId],
    foreignColumns: [safetyInstruction.id, safetyInstruction.tenantId],
  });

export const safetyInstructionSite = pgTable(
  'safety_instruction_site',
  {
    instructionId: uuid('instruction_id').$type<InstructionId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.instructionId, t.siteId] }),
    foreignKey({
      columns: [t.instructionId, t.tenantId],
      foreignColumns: [safetyInstruction.id, safetyInstruction.tenantId],
    }).onDelete('cascade'),
    siteForeignKey(t),
    index('safety_instruction_site_site_id_idx').on(t.siteId),
    index('safety_instruction_site_tenant_id_idx').on(t.tenantId),
    ...tenantPolicies(t, { site: null, readers: ['driver'] }),
  ],
);

export const VERSION_STATUSES = ['draft', 'published', 'retired'] as const;

export const safetyVersion = pgTable(
  'safety_version',
  {
    id: primaryId<'safety_version'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    instructionId: uuid('instruction_id').$type<InstructionId>().notNull(),
    version: integer('version').notNull(),
    status: text('status', { enum: VERSION_STATUSES }).notNull(),
    materialChange: boolean('material_change').notNull().default(false),
    publishedAt: instant('published_at'),
    publishedBy: uuid('published_by')
      .$type<UserId>()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    instructionRef(t),
    unique('safety_version_instruction_version_key').on(t.instructionId, t.version),
    unique('safety_version_id_tenant_key').on(t.id, t.tenantId),
    uniqueIndex('safety_version_one_draft').on(t.instructionId).where(sql`${t.status} = 'draft'`),
    uniqueIndex('safety_version_one_published')
      .on(t.instructionId)
      .where(sql`${t.status} = 'published'`),
    index('safety_version_tenant_id_idx').on(t.tenantId),
    check('safety_version_status_check', oneOf(t.status, VERSION_STATUSES)),
    ...tenantPolicies(t, { site: null, readers: [] }),
    allow('driver', 'select', and(tenantIs(t.tenantId), sql`${t.status} = 'published'`)),
  ],
);

export const TRANSLATION_STATES = ['source', 'machine', 'reviewed'] as const;

/** One locale of a version. Rows of a published version are immutable (SF-01). */
export const safetyContent = pgTable(
  'safety_content',
  {
    versionId: uuid('version_id').$type<VersionId>().notNull(),
    locale: text('locale').notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    title: text('title').notNull(),
    blocks: jsonb('blocks').notNull(),
    questions: jsonb('questions').notNull().default([]),
    statement: text('statement').notNull(),
    translation: text('translation', { enum: TRANSLATION_STATES }).notNull(),
    contentHash: bytea('content_hash').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.versionId, t.locale] }),
    foreignKey({
      columns: [t.versionId, t.tenantId],
      foreignColumns: [safetyVersion.id, safetyVersion.tenantId],
    }).onDelete('cascade'),
    index('safety_content_tenant_id_idx').on(t.tenantId),
    check('safety_content_translation_check', oneOf(t.translation, TRANSLATION_STATES)),
    ...tenantPolicies(t, { site: null, readers: [] }),
    allow(
      'driver',
      'select',
      and(
        tenantIs(t.tenantId),
        sql`exists (select 1 from safety_version v where v.id = ${t.versionId} and v.status = 'published')`,
      ),
    ),
  ],
);

export const ACK_CHANNELS = ['link', 'staff'] as const;

export const safetyAcknowledgement = pgTable(
  'safety_acknowledgement',
  {
    id: primaryId<'safety_acknowledgement'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    instructionId: uuid('instruction_id').$type<InstructionId>().notNull(),
    versionId: uuid('version_id').$type<VersionId>().notNull(),
    locale: text('locale').notNull(),
    contentHash: bytea('content_hash').notNull(),
    bookingId: uuid('booking_id')
      .$type<BookingId>()
      .references(() => booking.id, { onDelete: 'set null' }),
    carrierId: uuid('carrier_id').$type<CarrierId>(),
    driverName: text('driver_name').notNull(),
    statementShown: text('statement_shown').notNull(),
    channel: text('channel', { enum: ACK_CHANNELS }).notNull(),
    score: integer('score'),
    attempts: integer('attempts').notNull().default(1),
    completedAt: instant('completed_at').notNull(),
    expiresAt: instant('expires_at'),
    restrictedAt: instant('restricted_at'),
    pseudonymizedAt: instant('pseudonymized_at'),
    createdAt: createdAt(),
  },
  (t) => [
    instructionRef(t),
    foreignKey({
      columns: [t.versionId, t.tenantId],
      foreignColumns: [safetyVersion.id, safetyVersion.tenantId],
    }),
    unique('safety_acknowledgement_id_tenant_key').on(t.id, t.tenantId),
    index('safety_acknowledgement_tenant_completed_idx').on(t.tenantId, t.completedAt),
    index('safety_acknowledgement_tenant_driver_idx').on(t.tenantId, sql`lower(${t.driverName})`),
    index('safety_acknowledgement_booking_id_idx').on(t.bookingId),
    index('safety_acknowledgement_carrier_id_idx').on(t.carrierId),
    check('safety_acknowledgement_channel_check', oneOf(t.channel, ACK_CHANNELS)),
    ...tenantPolicies(t, { site: null, readers: [] }),
    allow('driver', 'select', and(tenantIs(t.tenantId), bookingIs(t.bookingId))),
    allow('driver', 'insert', and(tenantIs(t.tenantId), bookingIs(t.bookingId))),
  ],
);

export const LINK_VIA = ['completed', 'pass', 'gate_lookup'] as const;

export const bookingAcknowledgement = pgTable(
  'booking_acknowledgement',
  {
    bookingId: uuid('booking_id').$type<BookingId>().notNull(),
    instructionId: uuid('instruction_id').$type<InstructionId>().notNull(),
    acknowledgementId: uuid('acknowledgement_id').$type<AcknowledgementId>().notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    via: text('via', { enum: LINK_VIA }).notNull(),
    linkedByParty: text('linked_by_party').notNull(),
    linkedByUserId: uuid('linked_by_user_id').$type<UserId>(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.instructionId] }),
    foreignKey({
      columns: [t.bookingId, t.tenantId],
      foreignColumns: [booking.id, booking.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.acknowledgementId, t.tenantId],
      foreignColumns: [safetyAcknowledgement.id, safetyAcknowledgement.tenantId],
    }),
    index('booking_acknowledgement_tenant_id_idx').on(t.tenantId),
    index('booking_acknowledgement_site_id_idx').on(t.siteId),
    index('booking_acknowledgement_acknowledgement_id_idx').on(t.acknowledgementId),
    check('booking_acknowledgement_via_check', oneOf(t.via, LINK_VIA)),
    allow('tenant', 'all', and(tenantIs(t.tenantId), siteAllowed(t.siteId))),
    allow('driver', 'select', and(tenantIs(t.tenantId), bookingIs(t.bookingId))),
    allow('driver', 'insert', and(tenantIs(t.tenantId), bookingIs(t.bookingId))),
  ],
);

/** Quiz attempt counter per booking and version (SF-04). */
export const safetyAttempt = pgTable(
  'safety_attempt',
  {
    bookingId: uuid('booking_id').$type<BookingId>().notNull(),
    versionId: uuid('version_id').$type<VersionId>().notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastScore: integer('last_score'),
    passedAt: instant('passed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.versionId] }),
    foreignKey({
      columns: [t.bookingId, t.tenantId],
      foreignColumns: [booking.id, booking.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.versionId, t.tenantId],
      foreignColumns: [safetyVersion.id, safetyVersion.tenantId],
    }).onDelete('cascade'),
    index('safety_attempt_tenant_id_idx').on(t.tenantId),
    ...tenantPolicies(t, { site: null, readers: [] }),
    allow('driver', 'all', and(tenantIs(t.tenantId), bookingIs(t.bookingId))),
  ],
);

/** A phone's remembered acknowledgement per tenant and instruction (ADR-0008). */
export const safetyPass = pgTable(
  'safety_pass',
  {
    deviceHash: bytea('device_hash').notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    instructionId: uuid('instruction_id').$type<InstructionId>().notNull(),
    acknowledgementId: uuid('acknowledgement_id').$type<AcknowledgementId>().notNull(),
    expiresAt: instant('expires_at'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceHash, t.tenantId, t.instructionId] }),
    foreignKey({
      columns: [t.acknowledgementId, t.tenantId],
      foreignColumns: [safetyAcknowledgement.id, safetyAcknowledgement.tenantId],
    }).onDelete('cascade'),
    index('safety_pass_tenant_id_idx').on(t.tenantId),
    index('safety_pass_acknowledgement_id_idx').on(t.acknowledgementId),
    ...tenantPolicies(t, { site: null, readers: [] }),
    allow('driver', 'insert', tenantIs(t.tenantId)),
  ],
);
