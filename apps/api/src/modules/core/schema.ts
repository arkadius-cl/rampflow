import { ROLE_PARTY } from '@rampflow/shared';
import { CarrierLinkSource, CarrierLinkStatus } from '@rampflow/shared/modules/booking/values';
import {
  AuthTokenKind,
  DockStatus,
  DoorType,
  RateLimitBucket,
  Salutation,
  TaxIdStatus,
  TaxIdType,
  TemperatureZone,
} from '@rampflow/shared/modules/core/values';
import {
  ColumnMode,
  OrgKind,
  PackageId,
  PolicyCommand,
  PolicyReader,
  ScopeParty,
  StaffLocale,
  values,
} from '@rampflow/shared/values';
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

const rolesOf = (kind: OrgKind) =>
  Object.entries(ROLE_PARTY)
    .filter(([, party]) => party === kind)
    .map(([role]) => role);

/** Every party organisation: the single platform org, tenants and carriers. */
export const org = pgTable(
  'org',
  {
    id: uuid('id').$type<AnyOrgId>().primaryKey().default(sql`uuidv7()`),
    kind: text('kind', { enum: values(OrgKind) }).notNull(),
    name: text('name').notNull(),
    country: char('country', { length: 2 }),
    // Tenant-only facts (design decision 3); org_tenant_facts_check keeps them off other kinds.
    taxIdType: text('tax_id_type', { enum: values(TaxIdType) }),
    taxIdValue: text('tax_id_value'),
    taxIdStatus: text('tax_id_status', { enum: values(TaxIdStatus) }),
    taxIdCheckedAt: instant('tax_id_checked_at'),
    possibleDuplicate: boolean('possible_duplicate').notNull().default(false),
    /** Null while the tenant is onboarding (`tenantStatus`). */
    activatedAt: instant('activated_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('org_id_kind_key').on(t.id, t.kind),
    uniqueIndex('org_single_platform').on(t.kind).where(sql`${t.kind} = 'platform'`),
    index('org_tax_id_value_idx')
      .on(t.taxIdValue)
      .where(oneOf(t.kind, [OrgKind.tenant])),
    check('org_kind_check', oneOf(t.kind, values(OrgKind))),
    check('org_name_length', sql`char_length(${t.name}) between 1 and 120`),
    check(
      'org_tenant_facts_check',
      sql`${oneOf(t.kind, [OrgKind.tenant])} or (${t.taxIdType} is null and ${t.taxIdValue} is null and ${t.taxIdStatus} is null and ${t.taxIdCheckedAt} is null and not ${t.possibleDuplicate} and ${t.activatedAt} is null)`,
    ),
    check(
      'org_tax_id_check',
      sql`((${t.taxIdType} is null and ${t.taxIdValue} is null and ${t.taxIdStatus} is null) or (${t.taxIdType} is not null and ${t.taxIdValue} is not null and ${t.taxIdStatus} is not null)) and ${oneOf(t.taxIdType, values(TaxIdType))} and ${oneOf(t.taxIdStatus, values(TaxIdStatus))}`,
    ),
    allow(ScopeParty.platform, PolicyCommand.all, always),
    allow(
      ScopeParty.user,
      PolicyCommand.select,
      sql`exists (select 1 from membership m where m.org_id = ${t.id} and m.user_id = (select app.user_id()))`,
    ),
    // A tenant reads its own org, the carriers linked to it (TN-03), and the carriers a
    // registration would link, so it decides on the company it actually gets (TN-04).
    allow(
      ScopeParty.tenant,
      PolicyCommand.select,
      sql`${tenantIs(t.id)} or exists (select 1 from tenant_carrier_link l where l.tenant_id = (select app.tenant_id()) and l.carrier_id = ${t.id}) or exists (select 1 from carrier_registration r where r.tenant_id = (select app.tenant_id()) and r.carrier_id = ${t.id})`,
    ),
    allow(
      ScopeParty.carrier_at_tenant,
      PolicyCommand.select,
      sql`${tenantIs(t.id)} or ${carrierIs(t.id)}`,
    ),
    allow(ScopeParty.driver, PolicyCommand.select, tenantIs(t.id)),
    allow(ScopeParty.public, PolicyCommand.select, tenantIs(t.id)),
    // A carrier reads its own org, linked tenants, and tenants it registered at (CR-02).
    allow(
      ScopeParty.carrier,
      PolicyCommand.select,
      sql`${carrierIs(t.id)} or ${linkedTenant(t.id)} or exists (select 1 from carrier_registration r where r.carrier_id = (select app.carrier_id()) and r.tenant_id = ${t.id})`,
    ),
    allow(ScopeParty.system, PolicyCommand.select, always),
    // A carrier company comes into existence on invitation acceptance or registration (CR-01, CR-02),
    // an onboarding tenant on a verified self-registration (RG-02).
    allow(ScopeParty.user, PolicyCommand.insert, sql`${t.kind} = 'carrier'`),
    allow(
      ScopeParty.token,
      PolicyCommand.insert,
      sql`${t.kind} = 'carrier' or (${oneOf(t.kind, [OrgKind.tenant])} and ${t.activatedAt} is null)`,
    ),
  ],
);

/** A person. Visible to themselves, to the orgs they belong to, and to tenants their carrier serves. */
export const appUser = pgTable(
  'app_user',
  {
    id: primaryId<'user'>(),
    email: citext('email').notNull().unique(),
    name: text('name').notNull(),
    locale: text('locale', { enum: values(StaffLocale) }),
    // Name parts of a self-registered user, for email greetings only; `name` stays the display name.
    givenName: text('given_name'),
    familyName: text('family_name'),
    salutation: text('salutation', { enum: values(Salutation) }),
    passwordHash: text('password_hash'),
    emailVerifiedAt: instant('email_verified_at'),
    lastSeenAt: instant('last_seen_at'),
    disabledAt: instant('disabled_at'),
    /** UI state only: readable wherever the user row is (ADR-0014). */
    uiPrefs: jsonb('ui_prefs').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    check('app_user_locale_check', oneOf(t.locale, values(StaffLocale))),
    check('app_user_salutation_check', oneOf(t.salutation, values(Salutation))),
    check('app_user_ui_prefs_check', sql`jsonb_typeof(${t.uiPrefs}) = 'object'`),
    allow(ScopeParty.platform, PolicyCommand.all, always),
    allow(ScopeParty.user, PolicyCommand.select, userIs(t.id)),
    allow(ScopeParty.user, PolicyCommand.update, userIs(t.id)),
    allow(ScopeParty.token, PolicyCommand.select, userIs(t.id)),
    allow(ScopeParty.token, PolicyCommand.update, userIs(t.id)),
    allow(ScopeParty.token, PolicyCommand.insert, always),
    allow(ScopeParty.public, PolicyCommand.insert, always),
    allow(ScopeParty.tenant, PolicyCommand.select, sharesOrg(t.id)),
    allow(ScopeParty.carrier, PolicyCommand.select, sharesOrg(t.id)),
    allow(ScopeParty.carrier_at_tenant, PolicyCommand.select, sharesOrg(t.id)),
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

export const authToken = pgTable(
  'auth_token',
  {
    id: primaryId<'auth_token'>(),
    kind: text('kind', { enum: values(AuthTokenKind) }).notNull(),
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
    check('auth_token_kind_check', oneOf(t.kind, values(AuthTokenKind))),
  ],
);

export const rateLimitEvent = pgTable(
  'rate_limit_event',
  {
    id: bigint('id', { mode: ColumnMode.number }).primaryKey().generatedAlwaysAsIdentity(),
    bucket: text('bucket', { enum: values(RateLimitBucket) }).notNull(),
    keyHash: bytea('key_hash').notNull(),
    at: instant('at').notNull(),
  },
  (t) => [
    index('rate_limit_event_lookup_idx').on(t.bucket, t.keyHash, t.at),
    check('rate_limit_event_bucket_check', oneOf(t.bucket, values(RateLimitBucket))),
  ],
);

const membershipRoleCheck = (orgKind: AnyPgColumn, role: AnyPgColumn) =>
  sql.join(
    values(OrgKind).map(
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
    orgKind: text('org_kind', { enum: values(OrgKind) }).notNull(),
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
    allow(ScopeParty.user, PolicyCommand.select, userIs(t.userId)),
    allow(ScopeParty.platform, PolicyCommand.all, always),
    allow(ScopeParty.tenant, PolicyCommand.all, tenantIs(t.orgId)),
    allow(ScopeParty.carrier, PolicyCommand.all, carrierIs(t.orgId)),
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
    package: text('package', { enum: values(PackageId) }).notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('tenant_subscription_package_check', oneOf(t.package, values(PackageId))),
    ...tenantEntitlementPolicies(t),
    // A verified self-registration starts on the free package only (RG-02).
    allow(ScopeParty.token, PolicyCommand.insert, oneOf(t.package, [PackageId.start])),
  ],
);

function tenantEntitlementPolicies(t: { tenantId: AnyPgColumn }) {
  return [
    allow(ScopeParty.platform, PolicyCommand.all, always),
    allow(ScopeParty.tenant, PolicyCommand.select, tenantIs(t.tenantId)),
    allow(ScopeParty.carrier_at_tenant, PolicyCommand.select, tenantIs(t.tenantId)),
    allow(ScopeParty.driver, PolicyCommand.select, tenantIs(t.tenantId)),
    allow(ScopeParty.public, PolicyCommand.select, tenantIs(t.tenantId)),
    allow(ScopeParty.carrier, PolicyCommand.select, linkedTenant(t.tenantId)),
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
    allow(ScopeParty.platform, PolicyCommand.all, always),
    allow(ScopeParty.tenant, PolicyCommand.select, tenantIs(t.tenantId)),
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
    defaultLocale: text('default_locale', { enum: values(StaffLocale) }).notNull(),
    phone: text('phone'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('site_id_tenant_key').on(t.id, t.tenantId),
    index('site_tenant_id_idx').on(t.tenantId),
    check('site_default_locale_check', oneOf(t.defaultLocale, values(StaffLocale))),
    ...tenantPolicies(t, {
      site: t.id,
      readers: [
        PolicyReader.carrier,
        PolicyReader.carrier_at_tenant,
        PolicyReader.driver,
        PolicyReader.public,
      ],
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
    allow(ScopeParty.user, PolicyCommand.select, userIs(t.userId)),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: primaryId<'invitation'>(),
    orgId: uuid('org_id').$type<AnyOrgId>().notNull(),
    orgKind: text('org_kind', { enum: values(OrgKind) }).notNull(),
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
    allow(ScopeParty.platform, PolicyCommand.all, always),
    allow(ScopeParty.tenant, PolicyCommand.all, tenantIs(t.orgId)),
    allow(ScopeParty.carrier, PolicyCommand.all, carrierIs(t.orgId)),
    allow(ScopeParty.token, PolicyCommand.select, tokenIs(t.tokenHash)),
    allow(ScopeParty.token, PolicyCommand.update, tokenIs(t.tokenHash)),
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
      for: PolicyCommand.select,
      using: sql`(select app.party()) is not null and ${t.tenantId} is null`,
    }),
    allow(ScopeParty.platform, PolicyCommand.all, sql`${t.tenantId} is null`),
    allow(
      ScopeParty.tenant,
      PolicyCommand.all,
      and(tenantIs(t.tenantId), sql`${t.siteId} is null or ${siteAllowed(t.siteId)}`),
    ),
    allow(ScopeParty.carrier_at_tenant, PolicyCommand.select, tenantIs(t.tenantId)),
    allow(ScopeParty.driver, PolicyCommand.select, tenantIs(t.tenantId)),
    allow(ScopeParty.public, PolicyCommand.select, tenantIs(t.tenantId)),
    allow(ScopeParty.carrier, PolicyCommand.select, linkedTenant(t.tenantId)),
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
    ...tenantPolicies(t, {
      site: t.siteId,
      readers: [PolicyReader.carrier, PolicyReader.carrier_at_tenant, PolicyReader.driver],
    }),
  ],
);

export const dock = pgTable(
  'dock',
  {
    id: primaryId<'dock'>(),
    tenantId: uuid('tenant_id').$type<TenantId>().notNull(),
    siteId: uuid('site_id').$type<SiteId>().notNull(),
    hallId: uuid('hall_id').notNull(),
    code: text('code').notNull(),
    doorType: text('door_type', { enum: values(DoorType) }).notNull(),
    temperatureZone: text('temperature_zone', { enum: values(TemperatureZone) }).notNull(),
    adrAllowed: boolean('adr_allowed').notNull().default(false),
    status: text('status', { enum: values(DockStatus) }).notNull(),
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
    check('dock_door_type_check', oneOf(t.doorType, values(DoorType))),
    check('dock_temperature_zone_check', oneOf(t.temperatureZone, values(TemperatureZone))),
    check('dock_status_check', oneOf(t.status, values(DockStatus))),
    ...tenantPolicies(t, {
      site: t.siteId,
      readers: [PolicyReader.carrier, PolicyReader.carrier_at_tenant, PolicyReader.driver],
    }),
  ],
);

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
    status: text('status', { enum: values(CarrierLinkStatus) }).notNull(),
    source: text('source', { enum: values(CarrierLinkSource) }).notNull(),
    deactivatedAt: instant('deactivated_at'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.carrierId] }),
    index('tenant_carrier_link_carrier_id_idx').on(t.carrierId),
    check('tenant_carrier_link_status_check', oneOf(t.status, values(CarrierLinkStatus))),
    check('tenant_carrier_link_source_check', oneOf(t.source, values(CarrierLinkSource))),
    allow(ScopeParty.tenant, PolicyCommand.all, tenantIs(t.tenantId)),
    allow(ScopeParty.carrier, PolicyCommand.select, carrierIs(t.carrierId)),
    allow(
      ScopeParty.carrier_at_tenant,
      PolicyCommand.select,
      and(tenantIs(t.tenantId), carrierIs(t.carrierId)),
    ),
  ],
);

/** One row per job tick or per tenant step. Counts only, no personal data. No RLS. */
export const jobRun = pgTable(
  'job_run',
  {
    id: bigint('id', { mode: ColumnMode.number }).primaryKey().generatedAlwaysAsIdentity(),
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
