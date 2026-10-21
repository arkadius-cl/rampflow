import { Salutation, SignupStatus, TaxIdType } from '@rampflow/shared/modules/core/values';
import { StaffLocale, values } from '@rampflow/shared/values';
import { sql } from 'drizzle-orm';
import { char, check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  bytea,
  citext,
  createdAt,
  instant,
  oneOf,
  primaryId,
  type TenantId,
  type UserId,
} from '../../db/ids.ts';
import { appUser, org } from './schema.ts';

/** How long the emailed `signup` link works. */
export const SIGNUP_TOKEN_MS = 24 * 60 * 60 * 1000;

/**
 * A self-registration waiting for its email link (RG-01, RG-02). Auth-owned and without RLS,
 * like `auth_token`: no party owns it before the claim. Only core/signup/ and the retention job
 * import it (biome.json).
 */
export const tenantSignup = pgTable(
  'tenant_signup',
  {
    id: primaryId<'tenant_signup'>(),
    status: text('status', { enum: values(SignupStatus) }).notNull(),
    email: citext('email').notNull(),
    salutation: text('salutation', { enum: values(Salutation) }),
    givenName: text('given_name').notNull(),
    familyName: text('family_name').notNull(),
    /** scrypt; set to NULL by the claim. */
    passwordHash: text('password_hash'),
    companyName: text('company_name').notNull(),
    country: char('country', { length: 2 }).notNull(),
    /** Normalized by `normalizeTaxId`. */
    taxIdType: text('tax_id_type', { enum: values(TaxIdType) }).notNull(),
    taxIdValue: text('tax_id_value').notNull(),
    locale: text('locale', { enum: values(StaffLocale) }),
    /** `sha256` of the emailed `signup` token. */
    tokenHash: bytea('token_hash').notNull().unique(),
    expiresAt: instant('expires_at').notNull(),
    verifiedAt: instant('verified_at'),
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .references(() => org.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .$type<UserId>()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('tenant_signup_pending_email_key')
      .on(t.email)
      .where(oneOf(t.status, [SignupStatus.pending_email])),
    index('tenant_signup_expires_at_idx').on(t.expiresAt),
    index('tenant_signup_tenant_id_idx').on(t.tenantId),
    index('tenant_signup_user_id_idx').on(t.userId),
    check('tenant_signup_status_check', oneOf(t.status, values(SignupStatus))),
    check('tenant_signup_salutation_check', oneOf(t.salutation, values(Salutation))),
    check('tenant_signup_tax_id_type_check', oneOf(t.taxIdType, values(TaxIdType))),
    check('tenant_signup_locale_check', oneOf(t.locale, values(StaffLocale))),
    check(
      'tenant_signup_company_name_length',
      sql`char_length(${t.companyName}) between 1 and 120`,
    ),
    check(
      'tenant_signup_pending_password_check',
      sql`not (${oneOf(t.status, [SignupStatus.pending_email])}) or ${t.passwordHash} is not null`,
    ),
    check(
      'tenant_signup_verified_at_check',
      sql`not (${oneOf(t.status, [SignupStatus.verified])}) or ${t.verifiedAt} is not null`,
    ),
  ],
);

export type SignupId = (typeof tenantSignup.$inferSelect)['id'];
