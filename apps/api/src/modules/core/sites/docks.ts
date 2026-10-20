import {
  COUNTED_DOCK_STATUSES,
  type CreateDock,
  type CreateHall,
  type DockView,
  type HallView,
  type UpdateDock,
  type UpdateHall,
} from '@rampflow/shared/modules/core/api.sites';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { DockId, HallId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { withinLimit } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { resourceDock } from '../../booking/schema.resources.ts';
import { dock, hall } from '../schema.ts';
import { requireSite } from './sites.ts';
import { conflictOnUnique, invalid, type TenantRequest } from './tenant.ts';

type HallRow = typeof hall.$inferSelect;
type DockRow = typeof dock.$inferSelect;

const hallView = (row: HallRow): HallView => ({
  id: row.id,
  siteId: row.siteId,
  name: row.name,
  sort: row.sort,
});

export async function listHalls(tx: Tx, tenantId: TenantId, siteId: SiteId): Promise<HallView[]> {
  await requireSite(tx, tenantId, siteId);
  const rows = await tx
    .select()
    .from(hall)
    .where(and(eq(hall.tenantId, tenantId), eq(hall.siteId, siteId)))
    .orderBy(hall.sort, hall.name);
  return rows.map(hallView);
}

export async function createHall(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
  input: CreateHall,
): Promise<HallView> {
  await requireSite(tx, tenantId, siteId);
  const [row] = await tx
    .insert(hall)
    .values({ tenantId, siteId, name: input.name, sort: input.sort ?? 0 })
    .returning();
  if (!row) throw new Error('hall insert returned nothing');
  return hallView(row);
}

export async function updateHall(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
  hallId: HallId,
  input: UpdateHall,
): Promise<HallView> {
  await requireSite(tx, tenantId, siteId);
  const [row] = await tx
    .update(hall)
    .set(input)
    .where(and(eq(hall.tenantId, tenantId), eq(hall.siteId, siteId), eq(hall.id, hallId)))
    .returning();
  if (!row) throw new ApiError('not_found');
  return hallView(row);
}

async function dockViews(tx: Tx, tenantId: TenantId, rows: DockRow[]): Promise<DockView[]> {
  const ids = rows.map((r) => r.id as DockId);
  const links =
    ids.length === 0
      ? []
      : await tx
          .select({ dockId: resourceDock.dockId, resourceId: resourceDock.resourceId })
          .from(resourceDock)
          .where(and(eq(resourceDock.tenantId, tenantId), inArray(resourceDock.dockId, ids)));
  const resourceOf = new Map<string, string>(links.map((l) => [l.dockId, l.resourceId]));
  return rows.map((row) => ({
    id: row.id,
    siteId: row.siteId,
    hallId: row.hallId,
    code: row.code,
    doorType: row.doorType,
    temperatureZone: row.temperatureZone,
    adrAllowed: row.adrAllowed,
    status: row.status,
    sort: row.sort,
    resourceId: resourceOf.get(row.id) ?? null,
  }));
}

export async function listDocks(tx: Tx, tenantId: TenantId, siteId: SiteId): Promise<DockView[]> {
  await requireSite(tx, tenantId, siteId);
  const rows = await tx
    .select()
    .from(dock)
    .where(and(eq(dock.tenantId, tenantId), eq(dock.siteId, siteId)))
    .orderBy(dock.sort, dock.code);
  return dockViews(tx, tenantId, rows);
}

const isCounted = (status: DockRow['status']) =>
  (COUNTED_DOCK_STATUSES as readonly string[]).includes(status);

/** MD-02: `core.max_docks` counts active and maintenance docks of the whole tenant. */
export const countCountedDocks = (tenantId: TenantId) => async (tx: Tx) => {
  const [row] = await tx
    .select({ n: count() })
    .from(dock)
    .where(and(eq(dock.tenantId, tenantId), inArray(dock.status, [...COUNTED_DOCK_STATUSES])));
  return row?.n ?? 0;
};

function withinDockLimit(tx: Tx, req: TenantRequest): Promise<void> {
  return withinLimit(
    tx,
    req.tenantId,
    req.entitlements,
    'core.max_docks',
    countCountedDocks(req.tenantId),
  );
}

async function requireHallOnSite(tx: Tx, tenantId: TenantId, siteId: SiteId, hallId: string) {
  const [row] = await tx
    .select({ id: hall.id })
    .from(hall)
    .where(
      and(eq(hall.tenantId, tenantId), eq(hall.siteId, siteId), eq(hall.id, hallId as HallId)),
    );
  if (!row) throw invalid(['hallId'], 'No such hall on this site');
}

async function rejectDuplicateCode(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
  code: string,
  except: DockId | null,
): Promise<void> {
  const [row] = await tx
    .select({ id: dock.id })
    .from(dock)
    .where(and(eq(dock.tenantId, tenantId), eq(dock.siteId, siteId), eq(dock.code, code)));
  if (row && row.id !== except) {
    throw new ApiError('conflict', `Dock code ${code} exists on this site`, {
      reason: 'duplicate_code',
    });
  }
}

export async function createDock(
  tx: Tx,
  req: TenantRequest,
  siteId: SiteId,
  input: CreateDock,
): Promise<DockView> {
  await requireSite(tx, req.tenantId, siteId);
  await requireHallOnSite(tx, req.tenantId, siteId, input.hallId);
  if (isCounted(input.status)) await withinDockLimit(tx, req);
  await rejectDuplicateCode(tx, req.tenantId, siteId, input.code, null);
  const [row] = await tx
    .insert(dock)
    .values({ ...input, sort: input.sort ?? 0, tenantId: req.tenantId, siteId })
    .returning()
    .catch((e: unknown) => conflictOnUnique(e, 'dock_site_code_key', 'duplicate_code'));
  if (!row) throw new Error('dock insert returned nothing');
  const [view] = await dockViews(tx, req.tenantId, [row]);
  return view as DockView;
}

/** Leaving `inactive` counts toward `core.max_docks` again; maintenance removes capacity only. */
export async function updateDock(
  tx: Tx,
  req: TenantRequest,
  siteId: SiteId,
  dockId: DockId,
  input: UpdateDock,
): Promise<DockView> {
  await requireSite(tx, req.tenantId, siteId);
  const [current] = await tx
    .select()
    .from(dock)
    .where(and(eq(dock.tenantId, req.tenantId), eq(dock.siteId, siteId), eq(dock.id, dockId)));
  if (!current) throw new ApiError('not_found');
  if (input.hallId) await requireHallOnSite(tx, req.tenantId, siteId, input.hallId);
  if (input.status && isCounted(input.status) && !isCounted(current.status)) {
    await withinDockLimit(tx, req);
  }
  if (input.code) await rejectDuplicateCode(tx, req.tenantId, siteId, input.code, dockId);
  const [row] = await tx
    .update(dock)
    .set(input)
    .where(and(eq(dock.tenantId, req.tenantId), eq(dock.id, dockId)))
    .returning()
    .catch((e: unknown) => conflictOnUnique(e, 'dock_site_code_key', 'duplicate_code'));
  if (!row) throw new ApiError('not_found');
  const [view] = await dockViews(tx, req.tenantId, [row]);
  return view as DockView;
}
