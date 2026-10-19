import { randomUUID } from 'node:crypto';
import {
  catalog,
  type Entitlements,
  type PackageId,
  packages,
  parseEntitlementOverride,
} from '@rampflow/shared';
import type { EntitlementDef, Limit } from '@rampflow/shared/contract/module';
import type {
  CreateTenant,
  EntitlementView,
  OverrideView,
  PackageList,
  PutOverride,
  TenantDetail,
  TenantSummary,
  UpdateTenant,
} from '@rampflow/shared/modules/core/api.platform';
import { and, asc, eq } from 'drizzle-orm';
import { type OrgId, type TenantId, type UserId, wrapJson } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
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
      soft: def.kind === 'limit' && def.soft === true,
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
 * (PL-01). Accepting the invitation makes the invitee admin of this tenant only.
 */
export async function createTenant(tx: Tx, input: NewTenant, now: Date): Promise<TenantId> {
  const id = randomUUID() as TenantId;
  await tx.insert(org).values({ id: id as string as OrgId, kind: 'tenant', name: input.name });
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
      orgKind: 'tenant',
      orgName: input.name,
      email: input.adminEmail,
      role: 'tenant_admin',
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
}

async function tenantRows(tx: Tx, tenantId?: TenantId): Promise<TenantRow[]> {
  const rows = await tx
    .select({ id: org.id, name: org.name, package: tenantSubscription.package })
    .from(org)
    .innerJoin(tenantSubscription, eq(tenantSubscription.tenantId, org.id))
    .where(and(eq(org.kind, 'tenant'), tenantId ? eq(org.id, tenantId) : undefined))
    .orderBy(asc(org.name));
  return rows.map((r) => ({ ...r, id: r.id as string as TenantId }));
}

async function requireTenant(tx: Tx, tenantId: TenantId): Promise<TenantRow> {
  const [row] = await tenantRows(tx, tenantId);
  if (!row) throw new ApiError('not_found');
  return row;
}

async function summaries(tx: Tx, rows: readonly TenantRow[], now: Date) {
  const usage = await usageOf(tx, rows, now);
  return rows.map((row) => {
    const u = usage.get(row.id);
    if (!u) throw new Error(`no usage for ${row.id}`);
    return {
      summary: { ...row, usage: u.usage } satisfies TenantSummary,
      entitlements: u.entitlements,
    };
  });
}

/** PL-04: every tenant with its usage against its limits. */
export async function listTenants(tx: Tx, now: Date): Promise<TenantSummary[]> {
  return (await summaries(tx, await tenantRows(tx), now)).map((s) => s.summary);
}

function entitlementViews(pkg: PackageId, resolved: Entitlements): EntitlementView[] {
  const values: PackageValueMap = { ...resolved.features, ...resolved.limits };
  const packaged: PackageValueMap = packages[pkg];
  const sources: Readonly<Record<string, EntitlementView['source']>> = resolved.sources;
  return ENTITLEMENT_DEFS.map((d) => ({
    ...d,
    value: values[d.key] ?? null,
    source: sources[d.key] ?? 'default',
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
    if (error.code === 'invalid_value') {
      throw new ApiError('validation_failed', 'Invalid json', {
        issues: [
          { path: ['value'], code: 'invalid_type', message: `Expected a ${error.expected}` },
        ],
      });
    }
    throw new ApiError('bad_request', `${error.code} ${key}`, { reason: error.code });
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
      orgKind: 'tenant',
      orgName: row.name,
      email,
      role: 'tenant_admin',
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
