import {
  blockingFeature,
  catalog,
  type EntitlementOverride,
  type Entitlements,
  type HardLimitKey,
  type ImplementedFeatureKey,
  type ModuleId,
  type PackageId,
  type PermissionKey,
  packages,
  parseEntitlementOverride,
  permissionsFor,
  type ResolvedSetting,
  resolveEntitlements,
  resolveSetting,
  type SettingKey,
  type SettingValue,
} from '@rampflow/shared';
import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import type { TenantStatus } from '@rampflow/shared/modules/core/values';
import {
  DescribedKind,
  ErrorCode,
  GuardKind,
  Role,
  ScopeParty,
  SystemActorName,
  TenantActorKind,
} from '@rampflow/shared/values';
import { eq, isNull, or, sql } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { OrgId, SiteId, TenantId } from '../db/ids.ts';
import { asScope, type Scope, type Tx } from '../db/scope.ts';
import {
  entitlementOverride,
  org,
  settingValue,
  tenantSubscription,
} from '../modules/core/schema.ts';
import type { Clock } from './clock.ts';
import { register } from './describe.ts';
import type { AppEnv } from './env.ts';
import { ApiError } from './errors.ts';
import { systemActor } from './system.ts';

/** What the caller may do in this request (module contract, "Request environment"). */
export interface Access {
  /** `null` for driver, token, public, anonymous, user and system scopes. */
  role: Role | null;
  permissions: ReadonlySet<PermissionKey>;
  /** The acting tenant's; `null` for carrier (cross-tenant), platform and tenant-less scopes. */
  entitlements: Entitlements | null;
  /** The acting tenant's (ON-02); `null` outside the tenant and carrier-at-tenant parties. */
  tenantStatus: TenantStatus | null;
  setting<K extends SettingKey>(
    key: K,
    siteId: SiteId | null,
  ): Promise<ResolvedSetting<SettingValue<K>>>;
}

const NO_PERMISSIONS: ReadonlySet<PermissionKey> = new Set();

function roleOf(scope: Scope): Role | null {
  switch (scope.party) {
    case ScopeParty.platform:
      return Role.platform_admin;
    case ScopeParty.tenant:
      return scope.actor.kind === TenantActorKind.user ? scope.actor.role : null;
    case ScopeParty.carrier:
    case ScopeParty.carrier_at_tenant:
      return scope.role;
    default:
      return null;
  }
}

function tenantOf(scope: Scope): TenantId | null {
  switch (scope.party) {
    case ScopeParty.tenant:
    case ScopeParty.carrier_at_tenant:
    case ScopeParty.driver:
    case ScopeParty.public:
      return scope.tenantId;
    default:
      return null;
  }
}

/** Resolved entitlements of one tenant at `now` (ADR-0006). Stale override rows are skipped. */
export async function loadEntitlements(
  tx: Tx,
  tenantId: TenantId,
  now: Date,
): Promise<Entitlements> {
  const [subscription] = await tx
    .select({ package: tenantSubscription.package })
    .from(tenantSubscription)
    .where(eq(tenantSubscription.tenantId, tenantId));
  const rows = await tx
    .select()
    .from(entitlementOverride)
    .where(eq(entitlementOverride.tenantId, tenantId));
  const overrides: EntitlementOverride[] = [];
  for (const row of rows) {
    const parsed = parseEntitlementOverride(catalog, {
      key: row.key,
      value: row.value.v,
      expiresAt: row.expiresAt,
    });
    if (parsed.ok) overrides.push(parsed.value);
    else console.warn(`skipping stale entitlement override ${row.key}: ${parsed.error.code}`);
  }
  const pkg = subscription ? packages[subscription.package satisfies PackageId] : {};
  return resolveEntitlements(catalog, pkg, overrides, now);
}

function settingLoader(tx: Tx, tenantId: TenantId | null): Access['setting'] {
  let rows: Promise<(typeof settingValue.$inferSelect)[]> | undefined;
  const load = () => {
    rows ??= tx
      .select()
      .from(settingValue)
      .where(
        tenantId
          ? or(isNull(settingValue.tenantId), eq(settingValue.tenantId, tenantId))
          : isNull(settingValue.tenantId),
      );
    return rows;
  };
  return async (key, siteId) => {
    const all = (await load()).filter((r) => r.key === key);
    const value = (match: (r: (typeof all)[number]) => boolean) => all.find(match)?.value.v;
    return resolveSetting(catalog, key, {
      platform: value((r) => r.tenantId === null),
      tenant: tenantId ? value((r) => r.tenantId === tenantId && r.siteId === null) : undefined,
      site: tenantId && siteId ? value((r) => r.siteId === siteId) : undefined,
    });
  };
}

/**
 * Only the tenant and the platform read `entitlement_override` (its note is internal). A carrier
 * at the tenant, a driver or a public visitor is governed by the same entitlements, so they are
 * resolved as the tenant, inside the same transaction.
 */
function entitlementsOf(tx: Tx, scope: Scope, tenantId: TenantId, now: Date) {
  if (scope.party === ScopeParty.tenant) return loadEntitlements(tx, tenantId, now);
  const asTenant: Scope = {
    party: ScopeParty.tenant,
    tenantId,
    siteIds: [],
    actor: systemActor(SystemActorName.access),
  };
  return asScope(tx, asTenant, (inner) => loadEntitlements(inner, tenantId, now));
}

/** Both parties may select the tenant's org row; the others never gate on its status. */
async function tenantStatusOf(tx: Tx, scope: Scope): Promise<TenantStatus | null> {
  if (scope.party !== ScopeParty.tenant && scope.party !== ScopeParty.carrier_at_tenant) {
    return null;
  }
  const [row] = await tx
    .select({ activatedAt: org.activatedAt })
    .from(org)
    .where(eq(org.id, scope.tenantId as string as OrgId));
  return row ? tenantStatus(row) : null;
}

export async function loadAccess(tx: Tx, scope: Scope, clock: Clock): Promise<Access> {
  const role = roleOf(scope);
  const tenantId = tenantOf(scope);
  return {
    role,
    permissions: role ? catalogPermissions(role) : NO_PERMISSIONS,
    entitlements: tenantId ? await entitlementsOf(tx, scope, tenantId, clock.now()) : null,
    tenantStatus: await tenantStatusOf(tx, scope),
    setting: settingLoader(tx, tenantId),
  };
}

const permissionCache = new Map<Role, ReadonlySet<PermissionKey>>();
function catalogPermissions(role: Role): ReadonlySet<PermissionKey> {
  let set = permissionCache.get(role);
  if (!set) {
    set = permissionsFor(catalog, role);
    permissionCache.set(role, set);
  }
  return set;
}

/** 403 `entitlement_required` with the feature that keeps the module off. Applied at mount. */
export function requireModule(id: ModuleId): MiddlewareHandler<AppEnv> {
  const guard = createMiddleware<AppEnv>(async (c, next) => {
    const { entitlements } = c.var.access;
    if (entitlements && !entitlements.modules[id]) {
      throw new ApiError(ErrorCode.entitlement_required, `Module ${id} is off`, {
        key: blockingFeature(catalog, entitlements, id),
      });
    }
    await next();
  });
  return register(guard, { kind: DescribedKind.guard, guard: { kind: GuardKind.module, id } });
}

export function requirePermission(key: PermissionKey): MiddlewareHandler<AppEnv> {
  const guard = createMiddleware<AppEnv>(async (c, next) => {
    if (!c.var.access.permissions.has(key))
      throw new ApiError(ErrorCode.forbidden, `Missing ${key}`);
    await next();
  });
  return register(guard, { kind: DescribedKind.guard, guard: { kind: GuardKind.permission, key } });
}

/** For features finer than the module, for example `yard.call_to_dock`. */
export function requireEntitlement(key: ImplementedFeatureKey): MiddlewareHandler<AppEnv> {
  const guard = createMiddleware<AppEnv>(async (c, next) => {
    if (!c.var.access.entitlements?.features[key]) {
      throw new ApiError(ErrorCode.entitlement_required, `${key} is off`, { key });
    }
    await next();
  });
  return register(guard, {
    kind: DescribedKind.guard,
    guard: { kind: GuardKind.entitlement, key },
  });
}

/** Mounts a router of a module that can be off. Needs a non-root prefix. */
export function withModule<R extends Hono<AppEnv>>(id: ModuleId, router: R): R {
  return new Hono<AppEnv>().use(requireModule(id)).route('/', router) as unknown as R;
}

/**
 * Serializes writes against one hard limit of one tenant, then answers 409 `limit_reached`
 * when one more would exceed it. Call it in the transaction that writes the new row.
 */
export async function withinLimit(
  tx: Tx,
  tenantId: TenantId,
  entitlements: Entitlements,
  key: HardLimitKey,
  count: (tx: Tx) => Promise<number>,
): Promise<void> {
  const limit = entitlements.limits[key];
  if (limit === null) return;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`limit:${tenantId}:${key}`}, 0))`,
  );
  if ((await count(tx)) + 1 > limit) {
    throw new ApiError(ErrorCode.limit_reached, `Limit ${key} of ${limit} reached`, { key, limit });
  }
}
