import { randomUUID } from 'node:crypto';
import { catalog, type Entitlements, packages, parseEntitlementOverride } from '@rampflow/shared';
import type { ListStateOf } from '@rampflow/shared/contract/list';
import type { EntitlementDef, Limit } from '@rampflow/shared/contract/module';
import type {
  CreateTenant,
  EntitlementView,
  OverrideView,
  PackageList,
  PutOverride,
  TenantDetail,
  TenantList,
  TenantListQuery,
  TenantSummary,
  TenantSuspension,
  TenantTaxId,
  UpdateTenant,
} from '@rampflow/shared/modules/core/api.platform';
import { checkTaxId } from '@rampflow/shared/modules/core/tax-id';
import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import {
  type EuCountry,
  TaxIdCheck,
  TaxIdStatus,
  type TaxIdType,
  TenantCountryFacet,
  TenantFlag,
  TenantListView,
  TenantNoteKind,
  TenantSortKey,
  TenantStatus,
} from '@rampflow/shared/modules/core/values';
import {
  ConflictReason,
  EntitlementKind,
  EntitlementSource,
  ErrorCode,
  OrgKind,
  OverrideErrorCode,
  PackageId,
  Role,
  values,
  ZodIssueCode,
} from '@rampflow/shared/values';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  max,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { type OrgId, type TenantId, type UserId, wrapJson } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import {
  contains,
  facetCounts,
  inOrderOf,
  orderBy,
  pageOf,
  pageWindow,
} from '../../../kernel/list.ts';
import {
  appUser,
  entitlementOverride,
  invitation,
  membership,
  org,
  tenantNote,
  tenantSubscription,
} from '../schema.ts';
import { emailDomain } from '../signup/disposable-domains.ts';
import { type DuplicateIdentity, duplicateMatch } from '../signup/duplicate-match.ts';
import { isPending, issueInvitation } from '../staff/invitations.ts';
import { onboardingOf } from './tenant-reads.ts';
import { usageOf } from './usage.ts';

// Tenants, packages and overrides (PL-01, PL-02, PL-04, PL-06). Runs under the platform party,
// which reads and writes org, tenant_subscription, entitlement_override and invitation, and
// reads membership, app_user and tenant_note (data model).

type PackageValueMap = Readonly<Record<string, boolean | Limit | undefined>>;

const ENTITLEMENT_DEFS = catalog.flatMap((m) =>
  Object.entries(m.entitlements as Readonly<Record<string, EntitlementDef>>)
    .filter(([, def]) => !def.reserved)
    .map(([key, def]) => ({
      key,
      module: m.id,
      kind: def.kind,
      soft: def.kind === EntitlementKind.limit && def.soft === true,
    })),
);

export interface NewTenant extends CreateTenant {
  /** The platform admin creating the tenant. */
  createdBy: UserId;
  /** The invitation email's language. */
  locale: string;
}

/**
 * Creates the tenant org, its subscription and the first `tenant_admin` invitation with its email
 * (PL-01). Accepting the invitation makes the invitee admin of this tenant only. The tenant
 * starts in onboarding: `activated_at` stays null.
 */
export async function createTenant(tx: Tx, input: NewTenant, now: Date): Promise<TenantId> {
  const id = randomUUID() as TenantId;
  await tx
    .insert(org)
    .values({ id: id as string as OrgId, kind: OrgKind.tenant, name: input.name });
  await tx.insert(tenantSubscription).values({
    tenantId: id,
    package: input.package,
    updatedBy: input.createdBy,
    updatedAt: now,
  });
  await issueInvitation(
    tx,
    {
      orgId: id,
      orgKind: OrgKind.tenant,
      orgName: input.name,
      email: input.adminEmail,
      role: Role.tenant_admin,
      invitedBy: input.createdBy,
      fromPlatform: true,
      locale: input.locale,
    },
    now,
  );
  return id;
}

interface TenantRow {
  id: TenantId;
  name: string;
  package: PackageId;
  createdAt: Date;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  country: string | null;
  taxIdType: TaxIdType | null;
  taxIdValue: string | null;
  taxIdStatus: TaxIdStatus | null;
  taxIdCheckedAt: Date | null;
  possibleDuplicate: boolean;
}

/** A row with the columns the list derives from other tables (design decision 1). */
interface ListedTenantRow extends TenantRow {
  memberAdminEmail: string | null;
  invitedAdminEmail: string | null;
  lastActivityAt: Date | null;
}

const TENANT_COLUMNS = {
  id: org.id,
  name: org.name,
  package: tenantSubscription.package,
  createdAt: org.createdAt,
  activatedAt: org.activatedAt,
  suspendedAt: org.suspendedAt,
  country: org.country,
  taxIdType: org.taxIdType,
  taxIdValue: org.taxIdValue,
  taxIdStatus: org.taxIdStatus,
  taxIdCheckedAt: org.taxIdCheckedAt,
  possibleDuplicate: org.possibleDuplicate,
};

/** The tenants in each status, as `tenantStatus` derives it. */
const STATUS_WHERE: Record<TenantStatus, SQL> = {
  [TenantStatus.onboarding]: and(isNull(org.suspendedAt), isNull(org.activatedAt)) as SQL,
  [TenantStatus.active]: and(isNull(org.suspendedAt), isNotNull(org.activatedAt)) as SQL,
  [TenantStatus.suspended]: isNotNull(org.suspendedAt),
};

/** `tenantStatus` in SQL, for the sort. */
const STATUS = sql`case when ${STATUS_WHERE.suspended} then ${TenantStatus.suspended} when ${STATUS_WHERE.onboarding} then ${TenantStatus.onboarding} else ${TenantStatus.active} end`;

const FLAG_WHERE: Record<TenantFlag, SQL> = {
  [TenantFlag.possible_duplicate]: eq(org.possibleDuplicate, true),
  [TenantFlag.tax_id_unverified]: eq(org.taxIdStatus, TaxIdStatus.unverified),
};

const VIEW_WHERE: Record<TenantListView, SQL | undefined> = {
  [TenantListView.attention]: or(
    STATUS_WHERE.onboarding,
    STATUS_WHERE.suspended,
    ...values(TenantFlag).map((f) => FLAG_WHERE[f]),
  ),
  [TenantListView.all]: undefined,
};

/** The search term as tax ids are stored: without spaces, dots, dashes and slashes, upper-cased. */
const normalizeSearchTaxId = (q: string) => q.replace(/[\s./-]/g, '').toUpperCase();

const taxIdOf = (row: TenantRow): TenantTaxId | null =>
  row.taxIdType && row.taxIdValue && row.taxIdStatus
    ? { type: row.taxIdType, value: row.taxIdValue, status: row.taxIdStatus }
    : null;

const asTenantRow = <R extends { id: string }>(r: R): R & { id: TenantId } => ({
  ...r,
  id: r.id as TenantId,
});

export async function requireTenant(tx: Tx, tenantId: TenantId): Promise<TenantRow> {
  const [row] = await tx
    .select(TENANT_COLUMNS)
    .from(org)
    .innerJoin(tenantSubscription, eq(tenantSubscription.tenantId, org.id))
    .where(and(eq(org.kind, OrgKind.tenant), eq(org.id, tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  return asTenantRow(row);
}

/**
 * Tenant rows with the admin column and the last activity: the earliest `tenant_admin` member,
 * else the newest open admin invitation, as two lateral subqueries; `max(last_seen_at)` of the
 * members as a grouped subquery.
 */
function listedTenants(tx: Tx) {
  const memberAdmin = tx
    .select({ email: appUser.email })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(and(eq(membership.orgId, org.id), eq(membership.role, Role.tenant_admin)))
    .orderBy(asc(membership.createdAt), asc(membership.id))
    .limit(1)
    .as('member_admin');
  const invitedAdmin = tx
    .select({ email: invitation.email })
    .from(invitation)
    .where(and(eq(invitation.orgId, org.id), eq(invitation.role, Role.tenant_admin), isPending))
    .orderBy(desc(invitation.createdAt), desc(invitation.id))
    .limit(1)
    .as('invited_admin');
  const activity = tx
    .select({ orgId: membership.orgId, lastSeenAt: max(appUser.lastSeenAt).as('last_seen_at') })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(eq(membership.orgKind, OrgKind.tenant))
    .groupBy(membership.orgId)
    .as('activity');
  const query = tx
    .select({
      ...TENANT_COLUMNS,
      memberAdminEmail: memberAdmin.email,
      invitedAdminEmail: invitedAdmin.email,
      lastActivityAt: activity.lastSeenAt,
    })
    .from(org)
    .innerJoin(tenantSubscription, eq(tenantSubscription.tenantId, org.id))
    .leftJoinLateral(memberAdmin, sql`true`)
    .leftJoinLateral(invitedAdmin, sql`true`)
    .leftJoin(activity, eq(activity.orgId, org.id));
  return { query, lastActivityAt: activity.lastSeenAt };
}

async function summaries(tx: Tx, rows: readonly ListedTenantRow[], now: Date) {
  const usage = await usageOf(tx, rows, now);
  return rows.map((row) => {
    const u = usage.get(row.id);
    if (!u) throw new Error(`no usage for ${row.id}`);
    const adminEmail = row.memberAdminEmail ?? row.invitedAdminEmail;
    return {
      summary: {
        id: row.id,
        name: row.name,
        package: row.package,
        createdAt: row.createdAt.toISOString(),
        status: tenantStatus(row),
        country: row.country,
        taxId: taxIdOf(row),
        admin: adminEmail ? { email: adminEmail, invited: row.memberAdminEmail === null } : null,
        lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
        possibleDuplicate: row.possibleDuplicate,
        usage: u.usage,
      } satisfies TenantSummary,
      entitlements: u.entitlements,
    };
  });
}

/** The tenant's tax id and its admins' email domains, as the duplicate rule reads them. */
async function duplicateIdentity(tx: Tx, tenantId: string): Promise<DuplicateIdentity | null> {
  const [row] = await tx
    .select({ type: org.taxIdType, value: org.taxIdValue })
    .from(org)
    .where(and(eq(org.kind, OrgKind.tenant), eq(org.id, tenantId as TenantId)));
  if (!row) return null;
  const admins = await tx
    .select({ email: appUser.email })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(and(eq(membership.orgId, tenantId as TenantId), eq(membership.role, Role.tenant_admin)));
  return {
    taxId: row.type && row.value ? { type: row.type, value: row.value } : null,
    emailDomains: [...new Set(admins.map((a) => emailDomain(a.email)))],
  };
}

/** The tenant itself and every tenant the duplicate rule matches; nothing for an unknown id. */
async function duplicatesOf(tx: Tx, tenantId: string | undefined): Promise<SQL | undefined> {
  if (tenantId === undefined) return undefined;
  const identity = await duplicateIdentity(tx, tenantId);
  if (!identity) return sql`false`;
  return or(eq(org.id, tenantId as TenantId), duplicateMatch(tx, identity));
}

/** Name, tax id (ignoring separators) and the emails of admin members and open invitations. */
function searchOf(tx: Tx, q: string): SQL | undefined {
  if (q.trim() === '') return undefined;
  const adminMember = tx
    .select({ one: sql`1` })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(
      and(
        eq(membership.orgId, org.id),
        eq(membership.role, Role.tenant_admin),
        contains(q, appUser.email),
      ),
    );
  const adminInvitation = tx
    .select({ one: sql`1` })
    .from(invitation)
    .where(
      and(
        eq(invitation.orgId, org.id),
        eq(invitation.role, Role.tenant_admin),
        isPending,
        contains(q, invitation.email),
      ),
    );
  return or(
    contains(q, org.name),
    contains(normalizeSearchTaxId(q), org.taxIdValue),
    exists(adminMember),
    exists(adminInvitation),
  );
}

function countryWhere(selected: readonly TenantCountryFacet[]): SQL | undefined {
  if (selected.length === 0) return undefined;
  const codes = selected.filter((c) => c !== TenantCountryFacet.none);
  return or(
    selected.includes(TenantCountryFacet.none) ? isNull(org.country) : undefined,
    codes.length > 0 ? inArray(org.country, codes) : undefined,
  );
}

const countIf = (where: SQL | undefined) =>
  sql<number>`(count(*) filter (where ${where ?? sql`true`}))::int`;

/** One `count(*) filter` per member of a value set, as one row. */
const countsBy = <V extends string>(members: readonly V[], where: Record<V, SQL>) =>
  Object.fromEntries(members.map((m) => [m, countIf(where[m])])) as Record<V, SQL<number>>;

export type TenantListState = ListStateOf<typeof TenantListQuery>;

/**
 * PL-04: one page of tenants in the selected view, with their usage, the total, the facet
 * counts and the count of each view. Usage is counted for the page rows only, so the work per
 * request is bounded by the page size.
 */
export async function listTenants(tx: Tx, state: TenantListState, now: Date): Promise<TenantList> {
  const view = VIEW_WHERE[state.view];
  const common = and(
    eq(org.kind, OrgKind.tenant),
    searchOf(tx, state.q),
    await duplicatesOf(tx, state.duplicateOf),
  );
  const facet = {
    status: state.status.length > 0 ? or(...state.status.map((s) => STATUS_WHERE[s])) : undefined,
    package:
      state.package.length > 0 ? inArray(tenantSubscription.package, state.package) : undefined,
    country: countryWhere(state.country),
    flag: state.flag.length > 0 ? or(...state.flag.map((f) => FLAG_WHERE[f])) : undefined,
  };
  /** Search, `duplicateOf`, the view and every facet except `except`. */
  const within = (except?: keyof typeof facet) =>
    and(
      common,
      view,
      ...Object.entries(facet)
        .filter(([name]) => name !== except)
        .map(([, where]) => where),
    );
  const tenants = eq(tenantSubscription.tenantId, org.id);

  // The views count without the view, so each tab shows what selecting it would list.
  const [byView] = await tx
    .select({
      [TenantListView.attention]: countIf(VIEW_WHERE.attention),
      [TenantListView.all]: countIf(VIEW_WHERE.all),
    })
    .from(org)
    .innerJoin(tenantSubscription, tenants)
    .where(and(common, ...Object.values(facet)));
  // Each facet's counts ignore its own selection, so they show what another choice adds.
  const [byStatus] = await tx
    .select(countsBy(values(TenantStatus), STATUS_WHERE))
    .from(org)
    .innerJoin(tenantSubscription, tenants)
    .where(within('status'));
  const byPackage = await tx
    .select({ value: tenantSubscription.package, count: count() })
    .from(org)
    .innerJoin(tenantSubscription, tenants)
    .where(within('package'))
    .groupBy(tenantSubscription.package);
  const byCountry = await tx
    .select({ value: org.country, count: count() })
    .from(org)
    .innerJoin(tenantSubscription, tenants)
    .where(within('country'))
    .groupBy(org.country);
  const [byFlag] = await tx
    .select(countsBy(values(TenantFlag), FLAG_WHERE))
    .from(org)
    .innerJoin(tenantSubscription, tenants)
    .where(within('flag'));

  const { limit, offset } = pageWindow(state);
  const listed = listedTenants(tx);
  const rows = await listed.query
    .where(within())
    .orderBy(
      ...orderBy(
        state,
        {
          name: org.name,
          createdAt: org.createdAt,
          status: inOrderOf(values(TenantStatus), STATUS),
          package: inOrderOf(values(PackageId), tenantSubscription.package),
          country: org.country,
          lastActivityAt: sql`${listed.lastActivityAt}`,
        },
        org.id,
        { nullsLast: [TenantSortKey.country, TenantSortKey.lastActivityAt] },
      ),
    )
    .limit(limit)
    .offset(offset);
  const items = (await summaries(tx, rows.map(asTenantRow), now)).map((s) => s.summary);
  const countries = facetCounts(values(TenantCountryFacet), []);
  for (const row of byCountry) {
    const key = (row.value ?? TenantCountryFacet.none) as TenantCountryFacet;
    if (key in countries) countries[key] = row.count;
  }
  const views = { [TenantListView.attention]: 0, [TenantListView.all]: 0, ...byView };
  return {
    ...pageOf(state, views[state.view], items),
    facets: {
      status: { ...facetCounts(values(TenantStatus), []), ...byStatus },
      package: facetCounts(values(PackageId), byPackage),
      country: countries,
      flag: { ...facetCounts(values(TenantFlag), []), ...byFlag },
    },
    views,
  };
}

function entitlementViews(pkg: PackageId, resolved: Entitlements): EntitlementView[] {
  const values: PackageValueMap = { ...resolved.features, ...resolved.limits };
  const packaged: PackageValueMap = packages[pkg];
  const sources: Readonly<Record<string, EntitlementView['source']>> = resolved.sources;
  return ENTITLEMENT_DEFS.map((d) => ({
    ...d,
    value: values[d.key] ?? null,
    source: sources[d.key] ?? EntitlementSource.default,
    ...(packaged[d.key] === undefined ? {} : { packageValue: packaged[d.key] }),
  }));
}

/** The latest suspension note, while the tenant is suspended. */
async function suspensionOf(tx: Tx, tenantId: TenantId): Promise<TenantSuspension | null> {
  const [note] = await tx
    .select({
      at: tenantNote.createdAt,
      reason: tenantNote.body,
      byId: appUser.id,
      byName: appUser.name,
    })
    .from(tenantNote)
    .leftJoin(appUser, eq(appUser.id, tenantNote.authorId))
    .where(and(eq(tenantNote.tenantId, tenantId), eq(tenantNote.kind, TenantNoteKind.suspended)))
    .orderBy(desc(tenantNote.createdAt), desc(tenantNote.id))
    .limit(1);
  if (!note) return null;
  return {
    at: note.at.toISOString(),
    reason: note.reason,
    by: note.byId && note.byName ? { id: note.byId, name: note.byName } : null,
  };
}

/**
 * PL-02 and PL-06: the summary with lifecycle, admins and onboarding progress, the resolved
 * entitlements with sources, the overrides with expiry and the pending admin invitations.
 */
export async function tenantDetail(tx: Tx, tenantId: TenantId, now: Date): Promise<TenantDetail> {
  const [found] = await listedTenants(tx).query.where(
    and(eq(org.kind, OrgKind.tenant), eq(org.id, tenantId)),
  );
  if (!found) throw new ApiError(ErrorCode.not_found);
  const row = asTenantRow(found);
  const [first] = await summaries(tx, [row], now);
  if (!first) throw new Error(`no summary for ${tenantId}`);
  const { summary: s, entitlements } = first;
  const overrides = await tx
    .select()
    .from(entitlementOverride)
    .where(eq(entitlementOverride.tenantId, tenantId))
    .orderBy(asc(entitlementOverride.key));
  const invitations = await tx
    .select()
    .from(invitation)
    .where(and(eq(invitation.orgId, tenantId), eq(invitation.role, Role.tenant_admin), isPending))
    .orderBy(asc(invitation.createdAt));
  const admins = await tx
    .select({ id: appUser.id, name: appUser.name, email: appUser.email })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(and(eq(membership.orgId, tenantId), eq(membership.role, Role.tenant_admin)))
    .orderBy(asc(membership.createdAt), asc(membership.id));
  return {
    ...s,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    taxId: s.taxId ? { ...s.taxId, checkedAt: row.taxIdCheckedAt?.toISOString() ?? null } : null,
    suspension: s.status === TenantStatus.suspended ? await suspensionOf(tx, tenantId) : null,
    admins,
    onboarding: s.status === TenantStatus.onboarding ? await onboardingOf(tx, tenantId) : null,
    entitlements: entitlementViews(row.package, entitlements),
    overrides: overrides.map(
      (o): OverrideView => ({
        key: o.key,
        value: o.value.v as boolean | Limit,
        expiresAt: o.expiresAt?.toISOString() ?? null,
        note: o.note,
        active: o.expiresAt === null || o.expiresAt > now,
      }),
    ),
    adminInvitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      expiresAt: i.expiresAt.toISOString(),
    })),
  };
}

/**
 * Whether `country` may be the seat of a tenant with this tax id (design decision 2). Only the
 * country rule counts: format and check digits were checked at registration, and the check
 * status is the VIES job's to keep.
 */
const countryFitsTaxId = (row: TenantRow, country: EuCountry | null) =>
  !row.taxIdType ||
  !row.taxIdValue ||
  (country !== null &&
    checkTaxId(row.taxIdType, row.taxIdValue, country) !== TaxIdCheck.tax_id_country);

/**
 * PL-02 and PL-06. A country that does not fit the stored tax id answers 409 `conflict` with
 * reason `tax_id_country` before anything is written; the tax id itself never changes here.
 */
export async function updateTenant(
  tx: Tx,
  tenantId: TenantId,
  change: UpdateTenant,
  userId: UserId,
  now: Date,
): Promise<void> {
  const row = await requireTenant(tx, tenantId);
  if (change.country !== undefined && !countryFitsTaxId(row, change.country)) {
    throw new ApiError(ErrorCode.conflict, 'The country does not fit the tax id', {
      reason: ConflictReason.tax_id_country,
    });
  }
  if (change.name !== undefined || change.country !== undefined) {
    await tx
      .update(org)
      .set({ name: change.name, country: change.country })
      .where(eq(org.id, tenantId));
  }
  if (change.package !== undefined) {
    await tx
      .update(tenantSubscription)
      .set({ package: change.package, updatedBy: userId, updatedAt: now })
      .where(eq(tenantSubscription.tenantId, tenantId));
  }
}

/**
 * Sets one override (PL-02). Unknown and reserved keys answer 400, a value of the wrong kind
 * 422 on `value`. Applies from the tenant's next request: entitlements resolve per request.
 */
export async function putOverride(
  tx: Tx,
  tenantId: TenantId,
  key: string,
  input: PutOverride,
  userId: UserId,
  now: Date,
): Promise<OverrideView> {
  await requireTenant(tx, tenantId);
  const expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt);
  const parsed = parseEntitlementOverride(catalog, { key, value: input.value, expiresAt });
  if (!parsed.ok) {
    const { error } = parsed;
    if (error.code === OverrideErrorCode.invalid_value) {
      throw new ApiError(ErrorCode.validation_failed, 'Invalid json', {
        issues: [
          {
            path: ['value'],
            code: ZodIssueCode.invalid_type,
            message: `Expected a ${error.expected}`,
          },
        ],
      });
    }
    throw new ApiError(ErrorCode.bad_request, `${error.code} ${key}`, { reason: error.code });
  }
  const set = {
    value: wrapJson(input.value),
    expiresAt,
    note: input.note,
    updatedBy: userId,
    updatedAt: now,
  };
  await tx
    .insert(entitlementOverride)
    .values({ tenantId, key, ...set })
    .onConflictDoUpdate({ target: [entitlementOverride.tenantId, entitlementOverride.key], set });
  return {
    key,
    value: input.value,
    expiresAt: expiresAt?.toISOString() ?? null,
    note: input.note,
    active: expiresAt === null || expiresAt > now,
  };
}

export async function deleteOverride(tx: Tx, tenantId: TenantId, key: string): Promise<void> {
  await requireTenant(tx, tenantId);
  await tx
    .delete(entitlementOverride)
    .where(and(eq(entitlementOverride.tenantId, tenantId), eq(entitlementOverride.key, key)));
}

/** PL-01: a new tenant admin invitation, for example when the first one expired. */
export async function inviteTenantAdmin(
  tx: Tx,
  tenantId: TenantId,
  email: string,
  invitedBy: UserId,
  locale: string,
  now: Date,
) {
  const row = await requireTenant(tx, tenantId);
  return issueInvitation(
    tx,
    {
      orgId: tenantId,
      orgKind: OrgKind.tenant,
      orgName: row.name,
      email,
      role: Role.tenant_admin,
      invitedBy,
      fromPlatform: true,
      locale,
    },
    now,
  );
}

/** PL-02: the three packages, read-only. */
export function packageList(): PackageList {
  return {
    items: (Object.keys(packages) as PackageId[]).map((id) => {
      const values: PackageValueMap = packages[id];
      return {
        id,
        values: ENTITLEMENT_DEFS.filter((d) => values[d.key] !== undefined).map((d) => ({
          ...d,
          value: values[d.key] ?? null,
        })),
      };
    }),
  };
}
