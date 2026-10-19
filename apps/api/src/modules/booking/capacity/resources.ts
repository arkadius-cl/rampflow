import type {
  CreateResource,
  ResourceView,
  UpdateResource,
} from '@rampflow/shared/modules/booking/api.capacity';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { DockId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { dock } from '../../core/schema.ts';
import { requireSite } from '../../core/sites/sites.ts';
import { conflictOnUnique, invalid, type TenantRequest } from '../../core/sites/tenant.ts';
import { bookableResource, type ResourceId, resourceDock } from '../schema.resources.ts';

type ResourceRow = typeof bookableResource.$inferSelect;

/** Pools need `booking.pools` to be created or changed; existing pools keep offering (ADR-0004). */
function requirePools(req: TenantRequest, kind: ResourceRow['kind']): void {
  if (kind === 'pool' && !req.entitlements.features['booking.pools']) {
    throw new ApiError('entitlement_required', 'booking.pools is off', { key: 'booking.pools' });
  }
}

async function dockIdsOf(tx: Tx, tenantId: TenantId, ids: readonly ResourceId[]) {
  if (ids.length === 0) return new Map<ResourceId, string[]>();
  const rows = await tx
    .select({ resourceId: resourceDock.resourceId, dockId: resourceDock.dockId })
    .from(resourceDock)
    .where(and(eq(resourceDock.tenantId, tenantId), inArray(resourceDock.resourceId, [...ids])));
  const out = new Map<ResourceId, string[]>();
  for (const r of rows) out.set(r.resourceId, [...(out.get(r.resourceId) ?? []), r.dockId]);
  return out;
}

const view = (row: ResourceRow, dockIds: string[]): ResourceView => ({
  id: row.id,
  siteId: row.siteId,
  kind: row.kind,
  name: row.name,
  directions: row.directions,
  capacityCap: row.capacityCap,
  dailyCap: row.dailyCap,
  sort: row.sort,
  active: row.active,
  dockIds: dockIds.sort(),
});

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
  const docks = await dockIdsOf(
    tx,
    tenantId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => view(r, docks.get(r.id) ?? []));
}

async function requireResource(tx: Tx, tenantId: TenantId, id: ResourceId): Promise<ResourceRow> {
  const [row] = await tx
    .select()
    .from(bookableResource)
    .where(and(eq(bookableResource.id, id), eq(bookableResource.tenantId, tenantId)));
  if (!row) throw new ApiError('not_found');
  return row;
}

/**
 * Replaces the resource's docks. Every dock must be on the resource's site (422) and in no other
 * resource (409 `dock_in_resource`, MD-03); a single resource holds exactly one.
 */
async function setDocks(tx: Tx, resource: ResourceRow, dockIds: readonly string[]): Promise<void> {
  const ids = dockIds as DockId[];
  const onSite = await tx
    .select({ id: dock.id })
    .from(dock)
    .where(
      and(
        eq(dock.tenantId, resource.tenantId),
        eq(dock.siteId, resource.siteId),
        inArray(dock.id, ids),
      ),
    );
  const known = new Set(onSite.map((d) => d.id as string));
  const unknown = ids.findIndex((id) => !known.has(id));
  if (unknown >= 0) throw invalid(['dockIds', unknown], 'No such dock on this site');
  const taken = await tx
    .select({ dockId: resourceDock.dockId, resourceId: resourceDock.resourceId })
    .from(resourceDock)
    .where(
      and(
        eq(resourceDock.tenantId, resource.tenantId),
        inArray(resourceDock.dockId, ids),
        ne(resourceDock.resourceId, resource.id),
      ),
    );
  if (taken.length > 0) {
    throw new ApiError('conflict', 'Dock already belongs to a resource', {
      reason: 'dock_in_resource',
      dockIds: taken.map((t) => t.dockId),
    });
  }
  await tx
    .delete(resourceDock)
    .where(
      and(eq(resourceDock.tenantId, resource.tenantId), eq(resourceDock.resourceId, resource.id)),
    );
  await tx
    .insert(resourceDock)
    .values(
      ids.map((dockId) => ({
        dockId,
        resourceId: resource.id,
        resourceKind: resource.kind,
        siteId: resource.siteId,
        tenantId: resource.tenantId,
      })),
    )
    // A concurrent assignment of the same dock that committed after the check above.
    .catch((e: unknown) => conflictOnUnique(e, 'resource_dock_pkey', 'dock_in_resource'));
}

export async function createResource(
  tx: Tx,
  req: TenantRequest,
  input: CreateResource,
): Promise<ResourceView> {
  requirePools(req, input.kind);
  await requireSite(tx, req.tenantId, input.siteId as SiteId);
  const [row] = await tx
    .insert(bookableResource)
    .values({
      tenantId: req.tenantId,
      siteId: input.siteId as SiteId,
      kind: input.kind,
      name: input.name,
      directions: input.directions,
      capacityCap: input.capacityCap ?? null,
      dailyCap: input.dailyCap ?? null,
      sort: input.sort ?? 0,
    })
    .returning();
  if (!row) throw new Error('resource insert returned nothing');
  await setDocks(tx, row, input.dockIds);
  return view(row, [...input.dockIds]);
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
  if (current.kind === 'single' && input.capacityCap != null) {
    throw invalid(['capacityCap'], 'Only pools have a capacity cap');
  }
  const [row] = await tx
    .update(bookableResource)
    .set(input)
    .where(and(eq(bookableResource.id, id), eq(bookableResource.tenantId, req.tenantId)))
    .returning();
  if (!row) throw new ApiError('not_found');
  const docks = await dockIdsOf(tx, req.tenantId, [id]);
  return view(row, docks.get(id) ?? []);
}

export async function putResourceDocks(
  tx: Tx,
  req: TenantRequest,
  id: ResourceId,
  dockIds: readonly string[],
): Promise<ResourceView> {
  const current = await requireResource(tx, req.tenantId, id);
  requirePools(req, current.kind);
  if (current.kind === 'single' && dockIds.length !== 1) {
    throw invalid(['dockIds'], 'A single resource has exactly one dock');
  }
  await setDocks(tx, current, dockIds);
  return view(current, [...dockIds]);
}
