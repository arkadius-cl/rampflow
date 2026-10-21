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
  UpdateTenant,
} from '@rampflow/shared/modules/core/api.platform';
import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import { TenantStatus } from '@rampflow/shared/modules/core/values';
import {
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
import { and, asc, count, eq, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { type OrgId, type TenantId, type UserId, wrapJson } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { contains, facetCounts, orderBy, pageOf, pageWindow } from '../../../kernel/list.ts';
import { entitlementOverride, invitation, org, tenantSubscription } from '../schema.ts';
import { isPending, issueInvitation } from '../staff/invitations.ts';
import { usageOf } from './usage.ts';

// Tenants, packages and overrides (PL-01, PL-02, PL-04). Runs under the platform party, which
// reads and writes org, tenant_subscription, entitlement_override and invitation (data model).

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
}

const TENANT_COLUMNS = {
  id: org.id,
  name: org.name,
  package: tenantSubscription.package,
  createdAt: org.createdAt,
  activatedAt: org.activatedAt,
};

/** The tenants in each status, as `tenantStatus` derives it. */
const STATUS_WHERE: Record<TenantStatus, SQL> = {
  [TenantStatus.onboarding]: isNull(org.activatedAt),
  [TenantStatus.active]: isNotNull(org.activatedAt),
};

const asTenantRow = (r: { id: string } & Omit<TenantRow, 'id'>): TenantRow => ({
  ...r,
  id: r.id as TenantId,
});

async function requireTenant(tx: Tx, tenantId: TenantId): Promise<TenantRow> {
  const [row] = await tx
    .select(TENANT_COLUMNS)
    .from(org)
    .innerJoin(tenantSubscription, eq(tenantSubscription.tenantId, org.id))
    .where(and(eq(org.kind, OrgKind.tenant), eq(org.id, tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  return asTenantRow(row);
}

async function summaries(tx: Tx, rows: readonly TenantRow[], now: Date) {
  const usage = await usageOf(tx, rows, now);
  return rows.map((row) => {
    const u = usage.get(row.id);
    if (!u) throw new Error(`no usage for ${row.id}`);
    const { activatedAt, ...rest } = row;
    return {
      summary: {
        ...rest,
        createdAt: row.createdAt.toISOString(),
        status: tenantStatus({ activatedAt }),
        usage: u.usage,
      } satisfies TenantSummary,
      entitlements: u.entitlements,
    };
  });
}

export type TenantListState = ListStateOf<typeof TenantListQuery>;

/**
 * PL-04: one page of tenants with their usage, the total and the package and status counts.
 * Usage is counted for the page rows only, so the work per request is bounded by the page size.
 */
export async function listTenants(tx: Tx, state: TenantListState, now: Date): Promise<TenantList> {
  const criteria = and(eq(org.kind, OrgKind.tenant), contains(state.q, org.name));
  const packages =
    state.package.length > 0 ? inArray(tenantSubscription.package, state.package) : undefined;
  const statuses =
    state.status.length > 0 ? or(...state.status.map((s) => STATUS_WHERE[s])) : undefined;
  const where = and(criteria, packages, statuses);
  const [totalRow] = await tx
    .select({ n: count() })
    .from(org)
    .innerJoin(tenantSubscription, eq(tenantSubscription.tenantId, org.id))
    .where(where);
  // Each facet's counts ignore its own selection, so they show what another choice adds.
  const byPackage = await tx
    .select({ value: tenantSubscription.package, count: count() })
    .from(org)
    .innerJoin(tenantSubscription, eq(tenantSubscription.tenantId, org.id))
    .where(and(criteria, statuses))
    .groupBy(tenantSubscription.package);
  const [byStatus] = await tx
    .select({
      [TenantStatus.onboarding]: sql<number>`(count(*) filter (where ${STATUS_WHERE.onboarding}))::int`,
      [TenantStatus.active]: sql<number>`(count(*) filter (where ${STATUS_WHERE.active}))::int`,
    })
    .from(org)
    .innerJoin(tenantSubscription, eq(tenantSubscription.tenantId, org.id))
    .where(and(criteria, packages));
  const { limit, offset } = pageWindow(state);
  const rows = await tx
    .select(TENANT_COLUMNS)
    .from(org)
    .innerJoin(tenantSubscription, eq(tenantSubscription.tenantId, org.id))
    .where(where)
    .orderBy(...orderBy(state, { name: org.name, createdAt: org.createdAt }, org.id))
    .limit(limit)
    .offset(offset);
  const items = (await summaries(tx, rows.map(asTenantRow), now)).map((s) => s.summary);
  return {
    ...pageOf(state, totalRow?.n ?? 0, items),
    facets: {
      package: facetCounts(values(PackageId), byPackage),
      status: {
        [TenantStatus.onboarding]: byStatus?.onboarding ?? 0,
        [TenantStatus.active]: byStatus?.active ?? 0,
      },
    },
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

/** PL-02: resolved entitlements with sources, overrides with expiry, pending admin invitations. */
export async function tenantDetail(tx: Tx, tenantId: TenantId, now: Date): Promise<TenantDetail> {
  const row = await requireTenant(tx, tenantId);
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
    .where(and(eq(invitation.orgId, tenantId), eq(invitation.role, 'tenant_admin'), isPending))
    .orderBy(asc(invitation.createdAt));
  return {
    ...s,
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

export async function updateTenant(
  tx: Tx,
  tenantId: TenantId,
  change: UpdateTenant,
  userId: UserId,
  now: Date,
): Promise<void> {
  await requireTenant(tx, tenantId);
  if (change.name !== undefined) {
    await tx.update(org).set({ name: change.name }).where(eq(org.id, tenantId));
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
