import { STAFF_LOCALES } from '@rampflow/shared';
import { REGISTRATION_STATUSES } from '@rampflow/shared/modules/booking/api.carriers';
import { sql } from 'drizzle-orm';
import { char, check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  bytea,
  type CarrierId,
  citext,
  createdAt,
  instant,
  oneOf,
  primaryId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../../db/ids.ts';
import { allow, carrierIs, tenantIs, tenantPolicies, tokenIs } from '../../db/rls.ts';
import { appUser, org, siteForeignKey } from '../core/schema.ts';

/** A carrier company invited by a tenant (TN-03). */
export const carrierInvitation = pgTable(
  'carrier_invitation',
  {
    id: primaryId<'carrier_invitation'>(),
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .notNull()
      .references(() => org.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    email: citext('email').notNull(),
    tokenHash: bytea('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id),
    expiresAt: instant('expires_at').notNull(),
    acceptedAt: instant('accepted_at'),
    acceptedCarrierId: uuid('accepted_carrier_id')
      .$type<CarrierId>()
      .references(() => org.id),
    revokedAt: instant('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('carrier_invitation_pending_email_key')
      .on(t.tenantId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    ...tenantPolicies(t, { site: null, readers: [] }),
    allow('token', 'select', tokenIs(t.tokenHash)),
    allow('token', 'update', tokenIs(t.tokenHash)),
  ],
);

/** Slug of a site's public booking link (TN-04). A routing lookup without RLS. */
export const publicLink = pgTable(
  'public_link',
  {
    slug: text('slug').primaryKey(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    revokedAt: instant('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    siteForeignKey(t),
    uniqueIndex('public_link_active_site_key').on(t.siteId).where(sql`${t.revokedAt} is null`),
    index('public_link_tenant_id_idx').on(t.tenantId),
  ],
);

/** Lifetime of the emailed link that verifies a registration (CR-02). */
export const REGISTRATION_TOKEN_MS = 24 * 60 * 60 * 1000;

/** A carrier registering through a public link (CR-02). */
export const carrierRegistration = pgTable(
  'carrier_registration',
  {
    id: primaryId<'carrier_registration'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    companyName: text('company_name').notNull(),
    country: char('country', { length: 2 }).notNull(),
    contactName: text('contact_name').notNull(),
    email: citext('email').notNull(),
    /** The slug the registration came through; verification refuses it once revoked (TN-04). */
    publicLinkSlug: text('public_link_slug').references(() => publicLink.slug, {
      onDelete: 'set null',
    }),
    /** The language of the registration form; the carrier's emails use it. */
    locale: text('locale', { enum: STAFF_LOCALES }),
    /** `sha256` of the emailed `registration` token; claimed once while `pending_email`. */
    tokenHash: bytea('token_hash').unique(),
    expiresAt: instant('expires_at'),
    userId: uuid('user_id')
      .$type<UserId>()
      .references(() => appUser.id),
    carrierId: uuid('carrier_id')
      .$type<CarrierId>()
      .references(() => org.id),
    status: text('status', { enum: REGISTRATION_STATUSES }).notNull(),
    rejectReason: text('reject_reason'),
    emailVerifiedAt: instant('email_verified_at'),
    decidedAt: instant('decided_at'),
    decidedBy: uuid('decided_by')
      .$type<UserId>()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    siteForeignKey(t),
    index('carrier_registration_tenant_status_idx').on(t.tenantId, t.status),
    index('carrier_registration_site_id_idx').on(t.siteId),
    index('carrier_registration_carrier_id_idx').on(t.carrierId),
    check('carrier_registration_status_check', oneOf(t.status, REGISTRATION_STATUSES)),
    check(
      'carrier_registration_token_check',
      sql`${t.status} <> 'pending_email' or (${t.tokenHash} is not null and ${t.expiresAt} is not null)`,
    ),
    check('carrier_registration_locale_check', oneOf(t.locale, STAFF_LOCALES)),
    ...tenantPolicies(t, { site: null, readers: [] }),
    allow('public', 'insert', tenantIs(t.tenantId)),
    allow('carrier', 'select', carrierIs(t.carrierId)),
    allow('token', 'select', tokenIs(t.tokenHash)),
    allow('token', 'update', tokenIs(t.tokenHash)),
  ],
);
