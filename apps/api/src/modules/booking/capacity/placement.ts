import { createServerI18n } from '@rampflow/i18n/server';
import { Direction, ResourceKind } from '@rampflow/shared/modules/booking/values';
import { DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { ConflictReason, ErrorCode, Feature, values } from '@rampflow/shared/values';
import { and, eq, exists, inArray, isNull, max, ne, notExists, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DockId, HallId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { type dock, hall, site } from '../../core/schema.ts';
import { conflictOnMembership, type TenantRequest } from '../../core/sites/tenant.ts';
import {
  bookableResource,
  type LoadTypeId,
  loadType,
  loadTypeResource,
  type ResourceId,
  resourceDock,
} from '../schema.resources.ts';

// Where docks live (ADR-0017): every dock is in exactly one resource, a resource holds docks of
// one profile, and a dock's resource has an active load type. Callers hold `lockSiteCapacity`.

export type ResourceRow = typeof bookableResource.$inferSelect;
type DockRow = typeof dock.$inferSelect;
export type DockProfile = Pick<DockRow, 'doorType' | 'temperatureZone' | 'adrAllowed'>;
export type PlacedDock = DockProfile & {
  id: DockId;
  siteId: SiteId;
  hallId: string;
  code: string;
};

export const profileOf = (d: DockProfile): DockProfile => ({
  doorType: d.doorType,
  temperatureZone: d.temperatureZone,
  adrAllowed: d.adrAllowed,
});

export const sameProfile = (a: DockProfile, b: DockProfile): boolean =>
  a.doorType === b.doorType &&
  a.temperatureZone === b.temperatureZone &&
  a.adrAllowed === b.adrAllowed;

const NAME_MAX = 80;

/** "Halle 2 · Tiefkühl": the hall plus each attribute off the standard profile. */
async function defaultPoolName(tx: Tx, tenantId: TenantId, d: PlacedDock): Promise<string> {
  const [row] = await tx
    .select({ hall: hall.name, locale: site.defaultLocale })
    .from(hall)
    .innerJoin(site, eq(site.id, hall.siteId))
    .where(and(eq(hall.tenantId, tenantId), eq(hall.id, d.hallId as HallId)));
  if (!row) throw new Error(`hall ${d.hallId} not found`);
  const { t } = await createServerI18n(row.locale);
  const labels = [
    d.temperatureZone !== TemperatureZone.ambient && t(`core:sites.zones.${d.temperatureZone}`),
    d.doorType !== DoorType.dock_leveler && t(`core:sites.door_types.${d.doorType}`),
    d.adrAllowed && 'ADR',
  ].filter((l): l is string => typeof l === 'string');
  return [row.hall, ...labels].join(' · ').slice(0, NAME_MAX);
}

async function nextSort(tx: Tx, tenantId: TenantId, siteId: SiteId): Promise<number> {
  const [row] = await tx
    .select({ sort: max(bookableResource.sort) })
    .from(bookableResource)
    .where(and(eq(bookableResource.tenantId, tenantId), eq(bookableResource.siteId, siteId)));
  return row?.sort == null ? 0 : row.sort + 1;
}

export async function siteLoadTypeIds(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
): Promise<LoadTypeId[]> {
  const rows = await tx
    .select({ id: loadType.id })
    .from(loadType)
    .where(and(eq(loadType.tenantId, tenantId), eq(loadType.siteId, siteId)));
  return rows.map((r) => r.id);
}

/** The load types linked to the given resources, each once. */
export async function loadTypeIdsOf(
  tx: Tx,
  tenantId: TenantId,
  resourceIds: readonly ResourceId[],
): Promise<LoadTypeId[]> {
  if (resourceIds.length === 0) return [];
  const rows = await tx
    .selectDistinct({ id: loadTypeResource.loadTypeId })
    .from(loadTypeResource)
    .where(
      and(
        eq(loadTypeResource.tenantId, tenantId),
        inArray(loadTypeResource.resourceId, [...resourceIds]),
      ),
    );
  return rows.map((r) => r.id);
}

const activeLoadTypeOf = (tenantId: TenantId, resourceId: AnyPgColumn) =>
  sql`(select 1 from ${loadTypeResource} join ${loadType} on ${loadType.id} = ${loadTypeResource.loadTypeId} where ${loadTypeResource.tenantId} = ${tenantId} and ${loadType.tenantId} = ${tenantId} and ${loadTypeResource.resourceId} = ${resourceId} and ${loadType.active})`;

async function hasActiveLoadType(tx: Tx, resource: ResourceRow): Promise<boolean> {
  const [row] = await tx
    .select({ id: bookableResource.id })
    .from(bookableResource)
    .where(
      and(
        eq(bookableResource.tenantId, resource.tenantId),
        eq(bookableResource.id, resource.id),
        exists(activeLoadTypeOf(resource.tenantId, bookableResource.id)),
      ),
    );
  return row !== undefined;
}

export async function linkLoadTypes(
  tx: Tx,
  resource: ResourceRow,
  loadTypeIds: readonly LoadTypeId[],
): Promise<void> {
  if (loadTypeIds.length === 0) return;
  await tx
    .insert(loadTypeResource)
    .values(
      loadTypeIds.map((loadTypeId) => ({
        loadTypeId,
        resourceId: resource.id,
        siteId: resource.siteId,
        tenantId: resource.tenantId,
      })),
    )
    .onConflictDoNothing();
}

/** Inserts the membership with the dock's profile; the composite keys check it (ADR-0017). */
export async function joinResource(tx: Tx, d: PlacedDock, resource: ResourceRow): Promise<void> {
  await tx
    .insert(resourceDock)
    .values({
      dockId: d.id,
      resourceId: resource.id,
      resourceKind: resource.kind,
      siteId: resource.siteId,
      tenantId: resource.tenantId,
      ...profileOf(d),
    })
    .catch(conflictOnMembership);
}

/**
 * Takes docks out of their resources and returns the resources they left. A single resource is
 * its dock, so one that loses its dock is deactivated.
 */
export async function leaveResources(
  tx: Tx,
  tenantId: TenantId,
  dockIds: readonly DockId[],
): Promise<ResourceRow[]> {
  if (dockIds.length === 0) return [];
  const left = await tx
    .delete(resourceDock)
    .where(and(eq(resourceDock.tenantId, tenantId), inArray(resourceDock.dockId, [...dockIds])))
    .returning({ resourceId: resourceDock.resourceId, kind: resourceDock.resourceKind });
  const singles = left.filter((l) => l.kind === ResourceKind.single).map((l) => l.resourceId);
  if (singles.length > 0) {
    await tx
      .update(bookableResource)
      .set({ active: false })
      .where(and(eq(bookableResource.tenantId, tenantId), inArray(bookableResource.id, singles)));
  }
  const ids = [...new Set(left.map((l) => l.resourceId))];
  if (ids.length === 0) return [];
  return tx
    .select()
    .from(bookableResource)
    .where(and(eq(bookableResource.tenantId, tenantId), inArray(bookableResource.id, ids)));
}

/**
 * The single resource of a dock: a dockless single of its site named like the dock, set to the
 * dock's profile and reactivated, or a new one serving both directions. Without an active load
 * type it gets the load types of `origin`, or the site's.
 */
export async function singleFor(
  tx: Tx,
  req: TenantRequest,
  d: PlacedDock,
  directions: ResourceRow['directions'] | undefined,
  origin: ResourceRow | null,
): Promise<ResourceRow> {
  const [reusable] = await tx
    .select({ id: bookableResource.id })
    .from(bookableResource)
    .leftJoin(resourceDock, eq(resourceDock.resourceId, bookableResource.id))
    .where(
      and(
        eq(bookableResource.tenantId, req.tenantId),
        eq(bookableResource.siteId, d.siteId),
        eq(bookableResource.kind, ResourceKind.single),
        eq(bookableResource.name, d.code),
        isNull(resourceDock.dockId),
        // The resource the dock just left is never its new single (a single whose dock is replaced).
        origin ? ne(bookableResource.id, origin.id) : undefined,
      ),
    )
    .limit(1);
  const [row] = reusable
    ? await tx
        .update(bookableResource)
        .set({ active: true, ...profileOf(d), ...(directions ? { directions } : {}) })
        .where(
          and(eq(bookableResource.tenantId, req.tenantId), eq(bookableResource.id, reusable.id)),
        )
        .returning()
    : await tx
        .insert(bookableResource)
        .values({
          directions: directions ?? [...values(Direction)],
          tenantId: req.tenantId,
          siteId: d.siteId,
          kind: ResourceKind.single,
          name: d.code,
          sort: await nextSort(tx, req.tenantId, d.siteId),
          ...profileOf(d),
        })
        .returning();
  if (!row) throw new Error('single resource write returned nothing');
  if (!(await hasActiveLoadType(tx, row))) {
    const inherited = origin
      ? await loadTypeIdsOf(tx, req.tenantId, [origin.id])
      : await siteLoadTypeIds(tx, req.tenantId, d.siteId);
    await linkLoadTypes(tx, row, inherited);
  }
  return row;
}

/**
 * The default pool of the dock's hall and profile. Concurrent first docks meet in one row: the
 * second insert waits for the first commit on the unique index and does nothing.
 */
async function defaultPoolFor(tx: Tx, req: TenantRequest, d: PlacedDock): Promise<ResourceRow> {
  const profile = profileOf(d);
  const keyed = and(
    eq(bookableResource.tenantId, req.tenantId),
    eq(bookableResource.hallId, d.hallId),
    eq(bookableResource.doorType, profile.doorType),
    eq(bookableResource.temperatureZone, profile.temperatureZone),
    eq(bookableResource.adrAllowed, profile.adrAllowed),
  );
  const [existing] = await tx.select().from(bookableResource).where(keyed);
  if (existing) {
    if (!(await hasActiveLoadType(tx, existing))) {
      await linkLoadTypes(tx, existing, await siteLoadTypeIds(tx, req.tenantId, d.siteId));
    }
    return existing;
  }
  const [created] = await tx
    .insert(bookableResource)
    .values({
      tenantId: req.tenantId,
      siteId: d.siteId,
      kind: ResourceKind.pool,
      name: await defaultPoolName(tx, req.tenantId, d),
      directions: [...values(Direction)],
      sort: await nextSort(tx, req.tenantId, d.siteId),
      hallId: d.hallId,
      ...profile,
    })
    .onConflictDoNothing({
      target: [
        bookableResource.hallId,
        bookableResource.doorType,
        bookableResource.temperatureZone,
        bookableResource.adrAllowed,
      ],
      where: sql`${bookableResource.hallId} is not null`,
    })
    .returning();
  if (created) {
    await linkLoadTypes(tx, created, await siteLoadTypeIds(tx, req.tenantId, d.siteId));
    return created;
  }
  const [raced] = await tx.select().from(bookableResource).where(keyed);
  if (!raced) throw new Error('default pool neither inserted nor found');
  return raced;
}

/**
 * Puts a dock that has no resource into the default pool of its hall and profile, or, with
 * `booking.pools` off, into a single resource of its own (ADR-0017). `origin` is the resource
 * the dock just left, whose load types a new single inherits.
 */
export async function placeDock(
  tx: Tx,
  req: TenantRequest,
  d: PlacedDock,
  origin: ResourceRow | null,
): Promise<ResourceRow> {
  const resource = req.entitlements.features[Feature.booking.pools]
    ? await defaultPoolFor(tx, req, d)
    : await singleFor(tx, req, d, undefined, origin);
  await joinResource(tx, d, resource);
  return resource;
}

/**
 * 409 `dock_without_load_type` when one of the resources holds docks but no active load type.
 * Checked on the resources a write touched, so a site with unplaced legacy docks stays editable.
 */
export async function assertBookable(
  tx: Tx,
  tenantId: TenantId,
  resourceIds: readonly ResourceId[],
): Promise<void> {
  if (resourceIds.length === 0) return;
  const stranded = await tx
    .select({ dockId: resourceDock.dockId })
    .from(resourceDock)
    .where(
      and(
        eq(resourceDock.tenantId, tenantId),
        inArray(resourceDock.resourceId, [...new Set(resourceIds)]),
        notExists(activeLoadTypeOf(tenantId, resourceDock.resourceId)),
      ),
    )
    .orderBy(resourceDock.dockId);
  if (stranded.length > 0) {
    throw new ApiError(ErrorCode.conflict, 'Docks would have no active load type', {
      reason: ConflictReason.dock_without_load_type,
      dockIds: stranded.map((s) => s.dockId),
    });
  }
}
