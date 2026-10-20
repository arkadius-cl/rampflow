import { PACKAGE_IDS, ROLE_PARTY, STAFF_LOCALES } from '@rampflow/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  type AnyOrgId,
  bytea,
  type CarrierId,
  citext,
  createdAt,
  instant,
  isWrappedJson,
  type JsonValue,
  type MembershipId,
  oneOf,
  primaryId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../../db/ids.ts';
import {
  allow,
  always,
  and,
  carrierIs,
  linkedTenant,
  sharesOrg,
  siteAllowed,
  tenantIs,
  tenantPolicies,
  tokenIs,
  userIs,
} from '../../db/rls.ts';

export const ORG_KINDS = ['platform', 'tenant', 'carrier'] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

const rolesOf = (kind: OrgKind) =>
  Object.entries(ROLE_PARTY)
    .filter(([, party]) => party === kind)
    .map(([role]) => role);

/** Every party organisation: the single platform org, tenants and carriers. */
export const org = pgTable(
  'org',
  {
    id: uuid('id').$type<AnyOrgId>().primaryKey().default(sql`uuidv7()`),
    kind: text('kind', { enum: ORG_KINDS }).notNull(),
    name: text('name').notNull(),
    country: char('country', { length: 2 }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('org_id_kind_key').on(t.id, t.kind),
    uniqueIndex('org_single_platform').on(t.kind).where(sql`${t.kind} = 'platform'`),
    check('org_kind_check', oneOf(t.kind, ORG_KINDS)),
    check('org_name_length', sql`char_length(${t.name}) between 1 and 120`),
    allow('platform', 'all', always),
    allow(
      'user',
      'select',
      sql`exists (select 1 from membership m where m.org_id = ${t.id} and m.user_id = (select app.user_id()))`,
    ),
    // A tenant reads its own org, the carriers linked to it (TN-03), and the carriers a
    // registration would link, so it decides on the company it actually gets (TN-04).
    allow(
      'tenant',
      'select',
      sql`${tenantIs(t.id)} or exists (select 1 from tenant_carrier_link l where l.tenant_id = (select app.tenant_id()) and l.carrier_id = ${t.id}) or exists (select 1 from carrier_registration r where r.tenant_id = (select app.tenant_id()) and r.carrier_id = ${t.id})`,
    ),
    allow('carrier_at_tenant', 'select', sql`${tenantIs(t.id)} or ${carrierIs(t.id)}`),
    allow('driver', 'select', tenantIs(t.id)),
    allow('public', 'select', tenantIs(t.id)),
    // A carrier reads its own org, linked tenants, and tenants it registered at (CR-02).
    allow(
      'carrier',
      'select',
      sql`${carrierIs(t.id)} or ${linkedTenant(t.id)} or exists (select 1 from carrier_registration r where r.carrier_id = (select app.carrier_id()) and r.tenant_id = ${t.id})`,
    ),
    allow('system', 'select', always),
    // A carrier company comes into existence on invitation acceptance or registration (CR-01, CR-02).
    allow('user', 'insert', sql`${t.kind} = 'carrier'`),
    allow('token', 'insert', sql`${t.kind} = 'carrier'`),
  ],
);

/** A person. Visible to themselves, to the orgs they belong to, and to tenants their carrier serves. */
export const appUser = pgTable(
  'app_user',
  {
    id: primaryId<'user'>(),
    email: citext('email').notNull().unique(),
    name: text('name').notNull(),
    locale: text('locale', { enum: STAFF_LOCALES }),
    passwordHash: text('password_hash'),
    emailVerifiedAt: instant('email_verified_at'),
    lastSeenAt: instant('last_seen_at'),
    disabledAt: instant('disabled_at'),
    /** UI state only: readable wherever the user row is (ADR-0014). */
    uiPrefs: jsonb('ui_prefs').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    check('app_user_locale_check', oneOf(t.locale, STAFF_LOCALES)),
    check('app_user_ui_prefs_check', sql`jsonb_typeof(${t.uiPrefs}) = 'object'`),
    allow('platform', 'all', always),
    allow('user', 'select', userIs(t.id)),
    allow('user', 'update', userIs(t.id)),
    allow('token', 'select', userIs(t.id)),
    allow('token', 'update', userIs(t.id)),
    allow('token', 'insert', always),
    allow('public', 'insert', always),
    allow('tenant', 'select', sharesOrg(t.id)),
    allow('carrier', 'select', sharesOrg(t.id)),
    allow('carrier_at_tenant', 'select', sharesOrg(t.id)),
  ],
);

// Auth-owned tables without RLS. Only core/auth/ and kernel/ import them (biome.json).

export const session = pgTable(
  'session',
  {
    id: bytea('id').primaryKey(),
    userId: uuid('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    expiresAt: instant('expires_at').notNull(),
    lastSeenAt: instant('last_seen_at').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const AUTH_TOKEN_KINDS = ['magic_link', 'password_reset'] as const;

export const authToken = pgTable(
  'auth_token',
  {
    id: primaryId<'auth_token'>(),
    kind: text('kind', { enum: AUTH_TOKEN_KINDS }).notNull(),
    userId: uuid('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    tokenHash: bytea('token_hash').notNull().unique(),
    expiresAt: instant('expires_at').notNull(),
    usedAt: instant('used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('auth_token_user_id_idx').on(t.userId),
    check('auth_token_kind_check', oneOf(t.kind, AUTH_TOKEN_KINDS)),
  ],
);

export const RATE_LIMIT_BUCKETS = [
  'login_failed',
  'login_ip',
  'magic_link_request',
  'reset_request',
  'driver_exchange',
  'registration_request',
  'registration_ip',
] as const;
export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number];

export const rateLimitEvent = pgTable(
  'rate_limit_event',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    bucket: text('bucket', { enum: RATE_LIMIT_BUCKETS }).notNull(),
    keyHash: bytea('key_hash').notNull(),
    at: instant('at').notNull(),
  },
  (t) => [
    index('rate_limit_event_lookup_idx').on(t.bucket, t.keyHash, t.at),
    check('rate_limit_event_bucket_check', oneOf(t.bucket, RATE_LIMIT_BUCKETS)),
  ],
);

const membershipRoleCheck = (orgKind: AnyPgColumn, role: AnyPgColumn) =>
  sql.join(
    ORG_KINDS.map(
      (kind) => sql`(${orgKind} = ${sql.raw(`'${kind}'`)} and ${oneOf(role, rolesOf(kind))})`,
    ),
    sql` or `,
  );

export const membership = pgTable(
  'membership',
  {
    id: primaryId<'membership'>(),
    userId: uuid('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').$type<AnyOrgId>().notNull(),
    orgKind: text('org_kind', { enum: ORG_KINDS }).notNull(),
    role: text('role').notNull(),
    createdBy: uuid('created_by')
      .$type<UserId>()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.orgKind], foreignColumns: [org.id, org.kind] }).onDelete(
      'cascade',
    ),
    unique('membership_user_org_key').on(t.userId, t.orgId),
    unique('membership_id_org_key').on(t.id, t.orgId),
    index('membership_org_id_idx').on(t.orgId),
    check('membership_role_check', membershipRoleCheck(t.orgKind, t.role)),
    allow('user', 'select', userIs(t.userId)),
    allow('platform', 'all', always),
    allow('tenant', 'all', tenantIs(t.orgId)),
    allow('carrier', 'all', carrierIs(t.orgId)),
  ],
);

/** Tenant package. One row per tenant. */
export const tenantSubscription = pgTable(
  'tenant_subscription',
  {
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .primaryKey()
      .references(() => org.id, { onDelete: 'cascade' }),
    package: text('package', { enum: PACKAGE_IDS }).notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('tenant_subscription_package_check', oneOf(t.package, PACKAGE_IDS)),
    ...tenantEntitlementPolicies(t),
  ],
);

function tenantEntitlementPolicies(t: { tenantId: AnyPgColumn }) {
  return [
    allow('platform', 'all', always),
    allow('tenant', 'select', tenantIs(t.tenantId)),
    allow('carrier_at_tenant', 'select', tenantIs(t.tenantId)),
    allow('driver', 'select', tenantIs(t.tenantId)),
    allow('public', 'select', tenantIs(t.tenantId)),
    allow('carrier', 'select', linkedTenant(t.tenantId)),
  ];
}

export const entitlementOverride = pgTable(
  'entitlement_override',
  {
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .notNull()
      .references(() => org.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').$type<JsonValue>().notNull(),
    expiresAt: instant('expires_at'),
    note: text('note'),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.key] }),
    check('entitlement_override_value_wrapped', isWrappedJson(t.value)),
    // The note is the platform's internal reason: carriers, drivers and the public never read
    // overrides; loadAccess resolves their tenant's entitlements as the tenant (kernel/access.ts).
    allow('platform', 'all', always),
    allow('tenant', 'select', tenantIs(t.tenantId)),
  ],
);

export const site = pgTable(
  'site',
  {
    id: primaryId<'site'>(),
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .notNull()
      .references(() => org.id),
    name: text('name').notNull(),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    postalCode: text('postal_code').notNull(),
    city: text('city').notNull(),
    country: char('country', { length: 2 }).notNull(),
    subdivision: text('subdivision'),
    timeZone: text('time_zone').notNull(),
    defaultLocale: text('default_locale', { enum: STAFF_LOCALES }).notNull(),
    phone: text('phone'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('site_id_tenant_key').on(t.id, t.tenantId),
    index('site_tenant_id_idx').on(t.tenantId),
    check('site_default_locale_check', oneOf(t.defaultLocale, STAFF_LOCALES)),
    ...tenantPolicies(t, {
      site: t.id,
      readers: ['carrier', 'carrier_at_tenant', 'driver', 'public'],
    }),
  ],
);

/** `(site_id, tenant_id) → site(id, tenant_id)`: keeps a child inside its site's tenant. */
export const siteForeignKey = (t: { siteId: AnyPgColumn; tenantId: AnyPgColumn }) =>
  foreignKey({ columns: [t.siteId, t.tenantId], foreignColumns: [site.id, site.tenantId] });

/** Site list of gate and dock operators (TN-01). */
export const membershipSite = pgTable(
  'membership_site',
  {
    membershipId: uuid('membership_id').$type<MembershipId>().notNull(),
    userId: uuid('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.siteId] }),
    foreignKey({
      columns: [t.membershipId, t.tenantId],
      foreignColumns: [membership.id, membership.orgId],
    }).onDelete('cascade'),
    foreignKey({ columns: [t.siteId, t.tenantId], foreignColumns: [site.id, site.tenantId] }),
    index('membership_site_tenant_id_idx').on(t.tenantId),
    index('membership_site_site_id_idx').on(t.siteId),
    index('membership_site_user_id_idx').on(t.userId),
    ...tenantPolicies(t, { site: null, readers: [] }),
    allow('user', 'select', userIs(t.userId)),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: primaryId<'invitation'>(),
    orgId: uuid('org_id').$type<AnyOrgId>().notNull(),
    orgKind: text('org_kind', { enum: ORG_KINDS }).notNull(),
    email: citext('email').notNull(),
    role: text('role').notNull(),
    siteIds: uuid('site_ids').$type<SiteId>().array().notNull().default(sql`'{}'::uuid[]`),
    tokenHash: bytea('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by')
      .$type<UserId>()
      .references(() => appUser.id),
    expiresAt: instant('expires_at').notNull(),
    acceptedAt: instant('accepted_at'),
    acceptedUserId: uuid('accepted_user_id')
      .$type<UserId>()
      .references(() => appUser.id),
    revokedAt: instant('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.orgKind], foreignColumns: [org.id, org.kind] }).onDelete(
      'cascade',
    ),
    uniqueIndex('invitation_pending_email_key')
      .on(t.orgId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    check('invitation_role_check', membershipRoleCheck(t.orgKind, t.role)),
    allow('platform', 'all', always),
    allow('tenant', 'all', tenantIs(t.orgId)),
    allow('carrier', 'all', carrierIs(t.orgId)),
    allow('token', 'select', tokenIs(t.tokenHash)),
    allow('token', 'update', tokenIs(t.tokenHash)),
  ],
);

/** Platform rows have neither tenant nor site; tenant rows only a tenant; site rows both. */
export const settingValue = pgTable(
  'setting_value',
  {
    id: primaryId<'setting_value'>(),
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .references(() => org.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id').$type<SiteId>(),
    key: text('key').notNull(),
    value: jsonb('value').$type<JsonValue>().notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('setting_value_scope_key').on(t.tenantId, t.siteId, t.key).nullsNotDistinct(),
    check('setting_value_value_wrapped', isWrappedJson(t.value)),
    check('setting_value_site_needs_tenant', sql`${t.siteId} is null or ${t.tenantId} is not null`),
    foreignKey({
      columns: [t.siteId, t.tenantId],
      foreignColumns: [site.id, site.tenantId],
    }).onDelete('cascade'),
    index('setting_value_site_id_idx').on(t.siteId),
    pgPolicy('any_select_platform_rows', {
      for: 'select',
      using: sql`(select app.party()) is not null and ${t.tenantId} is null`,
    }),
    allow('platform', 'all', sql`${t.tenantId} is null`),
    allow(
      'tenant',
      'all',
      and(tenantIs(t.tenantId), sql`${t.siteId} is null or ${siteAllowed(t.siteId)}`),
    ),
    allow('carrier_at_tenant', 'select', tenantIs(t.tenantId)),
    allow('driver', 'select', tenantIs(t.tenantId)),
    allow('public', 'select', tenantIs(t.tenantId)),
    allow('carrier', 'select', linkedTenant(t.tenantId)),
  ],
);

export const hall = pgTable(
  'hall',
  {
    id: primaryId<'hall'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.siteId, t.tenantId], foreignColumns: [site.id, site.tenantId] }),
    unique('hall_id_site_key').on(t.id, t.siteId),
    index('hall_tenant_id_idx').on(t.tenantId),
    index('hall_site_id_idx').on(t.siteId),
    ...tenantPolicies(t, { site: t.siteId, readers: ['carrier', 'carrier_at_tenant', 'driver'] }),
  ],
);

export const DOOR_TYPES = ['dock_leveler', 'ground_level', 'side_loading', 'yard_open'] as const;
export const TEMPERATURE_ZONES = ['ambient', 'chilled', 'frozen'] as const;
export const DOCK_STATUSES = ['active', 'maintenance', 'inactive'] as const;

export const dock = pgTable(
  'dock',
  {
    id: primaryId<'dock'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    hallId: uuid('hall_id').notNull(),
    code: text('code').notNull(),
    doorType: text('door_type', { enum: DOOR_TYPES }).notNull(),
    temperatureZone: text('temperature_zone', { enum: TEMPERATURE_ZONES }).notNull(),
    adrAllowed: boolean('adr_allowed').notNull().default(false),
    status: text('status', { enum: DOCK_STATUSES }).notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.siteId, t.tenantId], foreignColumns: [site.id, site.tenantId] }),
    foreignKey({ columns: [t.hallId, t.siteId], foreignColumns: [hall.id, hall.siteId] }),
    unique('dock_site_code_key').on(t.siteId, t.code),
    unique('dock_id_site_key').on(t.id, t.siteId),
    index('dock_tenant_id_idx').on(t.tenantId),
    index('dock_hall_id_idx').on(t.hallId),
    check('dock_code_length', sql`char_length(${t.code}) between 1 and 16`),
    check('dock_door_type_check', oneOf(t.doorType, DOOR_TYPES)),
    check('dock_temperature_zone_check', oneOf(t.temperatureZone, TEMPERATURE_ZONES)),
    check('dock_status_check', oneOf(t.status, DOCK_STATUSES)),
    ...tenantPolicies(t, { site: t.siteId, readers: ['carrier', 'carrier_at_tenant', 'driver'] }),
  ],
);

export const LINK_STATUSES = ['active', 'deactivated'] as const;
export const LINK_SOURCES = ['invitation', 'public_link'] as const;

export const tenantCarrierLink = pgTable(
  'tenant_carrier_link',
  {
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .notNull()
      .references(() => org.id),
    carrierId: uuid('carrier_id')
      .$type<CarrierId>()
      .notNull()
      .references(() => org.id),
    status: text('status', { enum: LINK_STATUSES }).notNull(),
    source: text('source', { enum: LINK_SOURCES }).notNull(),
    deactivatedAt: instant('deactivated_at'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.carrierId] }),
    index('tenant_carrier_link_carrier_id_idx').on(t.carrierId),
    check('tenant_carrier_link_status_check', oneOf(t.status, LINK_STATUSES)),
    check('tenant_carrier_link_source_check', oneOf(t.source, LINK_SOURCES)),
    allow('tenant', 'all', tenantIs(t.tenantId)),
    allow('carrier', 'select', carrierIs(t.carrierId)),
    allow('carrier_at_tenant', 'select', and(tenantIs(t.tenantId), carrierIs(t.carrierId))),
  ],
);

/** One row per job tick or per tenant step. Counts only, no personal data. No RLS. */
export const jobRun = pgTable(
  'job_run',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    job: text('job').notNull(),
    tenantId: uuid('tenant_id').$type<TenantId>(),
    startedAt: instant('started_at').notNull(),
    finishedAt: instant('finished_at'),
    stats: jsonb('stats').$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [
    index('job_run_job_started_idx').on(t.job, t.startedAt),
    index('job_run_tenant_id_idx').on(t.tenantId),
  ],
);
