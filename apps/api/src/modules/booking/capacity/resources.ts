import type {
  CreateResource,
  DockBooking,
  ResourceView,
  UpdateResource,
} from '@rampflow/shared/modules/booking/api.capacity';
import { ResourceKind } from '@rampflow/shared/modules/booking/values';
import { ConflictReason, ErrorCode, Feature } from '@rampflow/shared/values';
import { and, eq, inArray } from 'drizzle-orm';
import type { DockId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { dock } from '../../core/schema.ts';
import { requireSite } from '../../core/sites/sites.ts';
import { invalid, type TenantRequest } from '../../core/sites/tenant.ts';
import {
  bookableResource,
  loadTypeResource,
  type ResourceId,
  resourceDock,
} from '../schema.resources.ts';
import { lockSiteCapacity } from './lock.ts';
import {
  assertBookable,
  type DockProfile,
  joinResource,
  leaveResources,
  linkLoadTypes,
  loadTypeIdsOf,
  type PlacedDock,
  placeDock,
  profileOf,
  type ResourceRow,
  sameProfile,
  singleFor,
  siteLoadTypeIds,
} from './placement.ts';

/** Pools need `booking.pools` to be created or changed; existing pools keep offering (ADR-0004). */
function requirePools(req: TenantRequest, kind: ResourceRow['kind']): void {
  if (kind === ResourceKind.pool && !req.entitlements.features[Feature.booking.pools]) {
    throw new ApiError(ErrorCode.entitlement_required, 'booking.pools is off', {
      key: 'booking.pools',
    });
  }
}

async function membersOf(tx: Tx, tenantId: TenantId, ids: readonly ResourceId[]) {
  const docks = new Map<ResourceId, string[]>();
  const loadTypes = new Map<ResourceId, string[]>();
  if (ids.length === 0) return { docks, loadTypes };
  const dockRows = await tx
    .select({ resourceId: resourceDock.resourceId, id: resourceDock.dockId })
    .from(resourceDock)
    .where(and(eq(resourceDock.tenantId, tenantId), inArray(resourceDock.resourceId, [...ids])));
  const loadTypeRows = await tx
    .select({ resourceId: loadTypeResource.resourceId, id: loadTypeResource.loadTypeId })
    .from(loadTypeResource)
    .where(
      and(eq(loadTypeResource.tenantId, tenantId), inArray(loadTypeResource.resourceId, [...ids])),
    );
  for (const [rows, out] of [
    [dockRows, docks],
    [loadTypeRows, loadTypes],
  ] as const) {
    for (const r of rows) out.set(r.resourceId, [...(out.get(r.resourceId) ?? []), r.id]);
  }
  return { docks, loadTypes };
}

const view = (row: ResourceRow, members: Awaited<ReturnType<typeof membersOf>>): ResourceView => ({
  id: row.id,
  siteId: row.siteId,
  kind: row.kind,
  name: row.name,
  directions: row.directions,
  capacityCap: row.capacityCap,
  dailyCap: row.dailyCap,
  sort: row.sort,
  active: row.active,
  dockIds: (members.docks.get(row.id) ?? []).sort(),
  doorType: row.doorType,
  temperatureZone: row.temperatureZone,
  adrAllowed: row.adrAllowed,
  hallId: row.hallId,
  loadTypeIds: (members.loadTypes.get(row.id) ?? []).sort(),
});

async function viewOf(tx: Tx, row: ResourceRow): Promise<ResourceView> {
  return view(row, await membersOf(tx, row.tenantId, [row.id]));
}

export async function listResources(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId | undefined,
): Promise<ResourceView[]> {
  if (siteId) await requireSite(tx, tenantId, siteId);
  const rows = await tx
    .select()
    .from(bookableResource)
    .where(
      and(
        eq(bookableResource.tenantId, tenantId),
        siteId ? eq(bookableResource.siteId, siteId) : undefined,
      ),
    )
    .orderBy(bookableResource.siteId, bookableResource.sort, bookableResource.name);
  const members = await membersOf(
    tx,
    tenantId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => view(r, members));
}

async function requireResource(tx: Tx, tenantId: TenantId, id: ResourceId): Promise<ResourceRow> {
  const [row] = await tx
    .select()
    .from(bookableResource)
    .where(and(eq(bookableResource.id, id), eq(bookableResource.tenantId, tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

/** The site of a resource, read before the lock that guards everything else about it. */
async function siteOfResource(tx: Tx, tenantId: TenantId, id: ResourceId): Promise<SiteId> {
  return (await requireResource(tx, tenantId, id)).siteId;
}

type MemberDock = PlacedDock & {
  holder: ResourceId | null;
  holderKind: ResourceRow['kind'] | null;
};

/** The named docks in request order, each on the site (422 at `dockIds[i]` otherwise). */
async function docksOnSite(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
  dockIds: readonly string[],
): Promise<MemberDock[]> {
  const ids = dockIds as DockId[];
  const rows = await tx
    .select({
      id: dock.id,
      siteId: dock.siteId,
      hallId: dock.hallId,
      code: dock.code,
      doorType: dock.doorType,
      temperatureZone: dock.temperatureZone,
      adrAllowed: dock.adrAllowed,
      holder: resourceDock.resourceId,
      holderKind: resourceDock.resourceKind,
    })
    .from(dock)
    .leftJoin(resourceDock, eq(resourceDock.dockId, dock.id))
    .where(and(eq(dock.tenantId, tenantId), eq(dock.siteId, siteId), inArray(dock.id, ids)));
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  return ids.map((id, i) => {
    const row = byId.get(id);
    if (!row) throw invalid(['dockIds', i], 'No such dock on this site');
    return { ...row, id: row.id as DockId };
  });
}

/** Taking a dock out of a pool changes the pool, which needs `booking.pools` (ADR-0004). */
function requirePoolsToLeave(
  req: TenantRequest,
  docks: readonly MemberDock[],
  target: ResourceId | null,
) {
  for (const d of docks) {
    if (d.holderKind && d.holder !== target) requirePools(req, d.holderKind);
  }
}

/** A resource holds docks of one profile (ADR-0017): 409 naming the docks that differ. */
function requireProfile(docks: readonly MemberDock[], profile: DockProfile): void {
  const differ = docks.filter((d) => !sameProfile(d, profile)).map((d) => d.id);
  if (differ.length > 0) {
    throw new ApiError(ErrorCode.conflict, 'Docks of another profile', {
      reason: ConflictReason.profile_mismatch,
      dockIds: differ,
    });
  }
}

/** A default pool takes docks of its own hall only. */
function requireHall(resource: ResourceRow, docks: readonly MemberDock[]): void {
  if (resource.hallId === null) return;
  const i = docks.findIndex((d) => d.hallId !== resource.hallId);
  if (i >= 0) throw invalid(['dockIds', i], 'A hall pool takes docks of its hall only');
}

/** Moves docks into `resource`, out of whatever held them; returns the resources they left. */
async function moveInto(
  tx: Tx,
  resource: ResourceRow,
  docks: readonly MemberDock[],
): Promise<ResourceRow[]> {
  const moving = docks.filter((d) => d.holder !== resource.id);
  const left = await leaveResources(
    tx,
    resource.tenantId,
    moving.map((d) => d.id),
  );
  for (const d of moving) await joinResource(tx, d, resource);
  return left;
}

/**
 * MD-03: a new resource takes its docks from wherever they are (ADR-0017). Its docks share one
 * profile, which becomes the resource's, and it serves the load types of the resources they
 * left (a dock in no resource brings the site's).
 */
export async function createResource(
  tx: Tx,
  req: TenantRequest,
  input: CreateResource,
): Promise<ResourceView> {
  const siteId = input.siteId as SiteId;
  await lockSiteCapacity(tx, siteId);
  requirePools(req, input.kind);
  await requireSite(tx, req.tenantId, siteId);
  const docks = await docksOnSite(tx, req.tenantId, siteId, input.dockIds);
  const [first] = docks;
  if (!first) throw invalid(['dockIds'], 'At least one dock');
  requirePoolsToLeave(req, docks, null);
  requireProfile(docks, first);
  const [row] = await tx
    .insert(bookableResource)
    .values({
      tenantId: req.tenantId,
      siteId,
      kind: input.kind,
      name: input.name,
      directions: input.directions,
      capacityCap: input.capacityCap ?? null,
      dailyCap: input.dailyCap ?? null,
      sort: input.sort ?? 0,
      ...profileOf(first),
    })
    .returning();
  if (!row) throw new Error('resource insert returned nothing');
  const origins = docks.flatMap((d) => (d.holder ? [d.holder] : []));
  const loadTypes = [
    ...(await loadTypeIdsOf(tx, req.tenantId, origins)),
    ...(docks.some((d) => d.holder === null)
      ? await siteLoadTypeIds(tx, req.tenantId, siteId)
      : []),
  ];
  await moveInto(tx, row, docks);
  await linkLoadTypes(tx, row, [...new Set(loadTypes)]);
  await assertBookable(tx, req.tenantId, [row.id]);
  return viewOf(tx, row);
}

/** MD-03: lowering capacity never touches bookings; the plan board flags them instead. */
export async function updateResource(
  tx: Tx,
  req: TenantRequest,
  id: ResourceId,
  input: UpdateResource,
): Promise<ResourceView> {
  const current = await requireResource(tx, req.tenantId, id);
  requirePools(req, current.kind);
  if (current.kind === ResourceKind.single && input.capacityCap != null) {
    throw invalid(['capacityCap'], 'Only pools have a capacity cap');
  }
  const [row] = await tx
    .update(bookableResource)
    .set(input)
    .where(and(eq(bookableResource.id, id), eq(bookableResource.tenantId, req.tenantId)))
    .returning();
  if (!row) throw new ApiError(ErrorCode.not_found);
  return viewOf(tx, row);
}

/**
 * MD-03: sets a resource's docks. Added docks move in from their resources; removed docks go
 * back to the default pool of their hall and profile, which cannot be this pool (409
 * `dock_needs_resource`).
 */
export async function putResourceDocks(
  tx: Tx,
  req: TenantRequest,
  id: ResourceId,
  dockIds: readonly string[],
): Promise<ResourceView> {
  await lockSiteCapacity(tx, await siteOfResource(tx, req.tenantId, id));
  const current = await requireResource(tx, req.tenantId, id);
  requirePools(req, current.kind);
  if (current.kind === ResourceKind.single && dockIds.length !== 1) {
    throw invalid(['dockIds'], 'A single resource has exactly one dock');
  }
  const docks = await docksOnSite(tx, req.tenantId, current.siteId, dockIds);
  requirePoolsToLeave(req, docks, current.id);
  requireProfile(docks, current);
  requireHall(current, docks);
  const kept = new Set<string>(dockIds);
  const removedIds = ((await membersOf(tx, req.tenantId, [id])).docks.get(id) ?? []).filter(
    (d) => !kept.has(d),
  ) as DockId[];
  if (removedIds.length > 0 && current.hallId !== null) {
    throw new ApiError(ErrorCode.conflict, 'Docks removed from their own hall pool', {
      reason: ConflictReason.dock_needs_resource,
      dockIds: removedIds.sort(),
    });
  }
  const removed = await tx
    .select()
    .from(dock)
    .where(and(eq(dock.tenantId, req.tenantId), inArray(dock.id, removedIds)));
  if (removedIds.length > 0) {
    // Not `leaveResources`: this resource keeps its other docks and stays active.
    await tx
      .delete(resourceDock)
      .where(
        and(eq(resourceDock.tenantId, req.tenantId), inArray(resourceDock.dockId, removedIds)),
      );
  }
  const placed: ResourceId[] = [];
  for (const d of removed) {
    placed.push((await placeDock(tx, req, { ...d, id: d.id as DockId }, current)).id);
  }
  await moveInto(tx, current, docks);
  await assertBookable(tx, req.tenantId, [current.id, ...placed]);
  return viewOf(tx, current);
}

/**
 * MD-03: books a dock as a single resource or as a member of a pool, in one transaction. A
 * single resource is its dock: the dock leaving deactivates it, and booking the dock as single
 * again reactivates a dockless single of the same name before creating one.
 */
export async function bookDock(
  tx: Tx,
  req: TenantRequest,
  dockId: DockId,
  input: DockBooking,
): Promise<ResourceView> {
  const [located] = await tx
    .select({ siteId: dock.siteId })
    .from(dock)
    .where(and(eq(dock.tenantId, req.tenantId), eq(dock.id, dockId)));
  if (!located) throw new ApiError(ErrorCode.not_found);
  await lockSiteCapacity(tx, located.siteId);
  const [target] = await docksOnSite(tx, req.tenantId, located.siteId, [dockId]);
  if (!target) throw new ApiError(ErrorCode.not_found);
  const current = target.holder ? await requireResource(tx, req.tenantId, target.holder) : null;
  if (current) requirePools(req, current.kind);
  if (input.as === ResourceKind.pool) {
    const pool = await requireResource(tx, req.tenantId, input.resourceId as ResourceId);
    if (pool.kind !== ResourceKind.pool || pool.siteId !== target.siteId) {
      throw invalid(['resourceId'], 'No such pool on this site');
    }
    requirePools(req, pool.kind);
    if (current?.id === pool.id) return viewOf(tx, pool);
    requireProfile([target], pool);
    if (pool.hallId !== null && pool.hallId !== target.hallId) {
      throw invalid(['resourceId'], 'A hall pool takes docks of its hall only');
    }
    await moveInto(tx, pool, [target]);
    await assertBookable(tx, req.tenantId, [pool.id]);
    return viewOf(tx, pool);
  }
  if (current?.kind === ResourceKind.single) {
    const directions = input.directions ?? current.directions;
    return updateResource(tx, req, current.id, { directions, active: true });
  }
  await leaveResources(tx, req.tenantId, [dockId]);
  const single = await singleFor(tx, req, target, input.directions, current);
  await joinResource(tx, target, single);
  await assertBookable(tx, req.tenantId, [single.id]);
  return viewOf(tx, single);
}
