import type {
  CreateLoadType,
  LoadTypeDuration,
  LoadTypeView,
  UpdateLoadType,
} from '@rampflow/shared/modules/booking/api.capacity';
import { Direction, DurationKind } from '@rampflow/shared/modules/booking/values';
import { ErrorCode, Feature } from '@rampflow/shared/values';
import { and, eq, inArray } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { requireSite } from '../../core/sites/sites.ts';
import { invalid, type TenantRequest } from '../../core/sites/tenant.ts';
import {
  bookableResource,
  type LoadTypeId,
  loadType,
  loadTypeResource,
  type ResourceId,
} from '../schema.resources.ts';

type LoadTypeRow = typeof loadType.$inferSelect;

/** Every new site starts with these (MD-05, domain research §2). */
export const SEEDED_LOAD_TYPES = [
  {
    name: { de: 'Paket / Transporter', en: 'Parcel / van' },
    duration: { kind: DurationKind.fixed, minutes: 15 },
  },
  {
    name: { de: 'Palettiert', en: 'Palletised' },
    duration: {
      kind: DurationKind.tiers,
      tiers: [
        { upTo: 16, minutes: 30 },
        { upTo: 33, minutes: 60 },
        { upTo: null, minutes: 90 },
      ],
    },
  },
  {
    name: { de: 'Lose verladen', en: 'Floor-loaded / loose' },
    duration: { kind: DurationKind.fixed, minutes: 90 },
  },
] as const satisfies readonly { name: LoadTypeView['name']; duration: LoadTypeDuration }[];

export async function seedLoadTypes(tx: Tx, s: { id: SiteId; tenantId: TenantId }): Promise<void> {
  await tx.insert(loadType).values(
    SEEDED_LOAD_TYPES.map((seed, sort) => ({
      tenantId: s.tenantId,
      siteId: s.id,
      name: seed.name,
      direction: Direction.inbound,
      duration: seed.duration as LoadTypeDuration,
      sort,
    })),
  );
}

/** Tiered durations need `booking.duration_rules` to be written (MD-05). */
function requireDurationRules(req: TenantRequest, duration: LoadTypeDuration | undefined): void {
  if (
    duration?.kind === DurationKind.tiers &&
    !req.entitlements.features[Feature.booking.duration_rules]
  ) {
    throw new ApiError(ErrorCode.entitlement_required, 'booking.duration_rules is off', {
      key: 'booking.duration_rules',
    });
  }
}

async function resourceIdsOf(tx: Tx, tenantId: TenantId, ids: readonly LoadTypeId[]) {
  if (ids.length === 0) return new Map<LoadTypeId, string[]>();
  const rows = await tx
    .select()
    .from(loadTypeResource)
    .where(
      and(eq(loadTypeResource.tenantId, tenantId), inArray(loadTypeResource.loadTypeId, [...ids])),
    );
  const out = new Map<LoadTypeId, string[]>();
  for (const r of rows) out.set(r.loadTypeId, [...(out.get(r.loadTypeId) ?? []), r.resourceId]);
  return out;
}

const view = (row: LoadTypeRow, resourceIds: string[]): LoadTypeView => ({
  id: row.id,
  siteId: row.siteId,
  name: row.name,
  direction: row.direction,
  duration: row.duration,
  bufferMinutes: row.bufferMinutes,
  carrierBookable: row.carrierBookable,
  active: row.active,
  sort: row.sort,
  resourceIds: resourceIds.sort(),
});

export async function listLoadTypes(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
): Promise<LoadTypeView[]> {
  await requireSite(tx, tenantId, siteId);
  const rows = await tx
    .select()
    .from(loadType)
    .where(and(eq(loadType.tenantId, tenantId), eq(loadType.siteId, siteId)))
    .orderBy(loadType.sort, loadType.id);
  const links = await resourceIdsOf(
    tx,
    tenantId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => view(r, links.get(r.id) ?? []));
}

async function requireLoadType(tx: Tx, tenantId: TenantId, id: LoadTypeId): Promise<LoadTypeRow> {
  const [row] = await tx
    .select()
    .from(loadType)
    .where(and(eq(loadType.tenantId, tenantId), eq(loadType.id, id)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

/** Eligible resources of a load type; all on its site (422 otherwise). */
async function setResources(
  tx: Tx,
  lt: LoadTypeRow,
  resourceIds: readonly string[],
): Promise<void> {
  const ids = resourceIds as ResourceId[];
  if (ids.length > 0) {
    const found = await tx
      .select({ id: bookableResource.id })
      .from(bookableResource)
      .where(
        and(
          eq(bookableResource.tenantId, lt.tenantId),
          eq(bookableResource.siteId, lt.siteId),
          inArray(bookableResource.id, ids),
        ),
      );
    const known = new Set<string>(found.map((r) => r.id));
    const unknown = ids.findIndex((id) => !known.has(id));
    if (unknown >= 0) throw invalid(['resourceIds', unknown], 'No such resource on this site');
  }
  await tx
    .delete(loadTypeResource)
    .where(and(eq(loadTypeResource.tenantId, lt.tenantId), eq(loadTypeResource.loadTypeId, lt.id)));
  if (ids.length > 0) {
    await tx.insert(loadTypeResource).values(
      ids.map((resourceId) => ({
        loadTypeId: lt.id,
        resourceId,
        siteId: lt.siteId,
        tenantId: lt.tenantId,
      })),
    );
  }
}

export async function createLoadType(
  tx: Tx,
  req: TenantRequest,
  input: CreateLoadType,
): Promise<LoadTypeView> {
  requireDurationRules(req, input.duration);
  const siteId = input.siteId as SiteId;
  await requireSite(tx, req.tenantId, siteId);
  const { resourceIds, ...fields } = input;
  const [row] = await tx
    .insert(loadType)
    .values({ ...fields, siteId, tenantId: req.tenantId })
    .returning();
  if (!row) throw new Error('load type insert returned nothing');
  await setResources(tx, row, resourceIds);
  return view(row, [...resourceIds]);
}

export async function updateLoadType(
  tx: Tx,
  req: TenantRequest,
  id: LoadTypeId,
  input: UpdateLoadType,
): Promise<LoadTypeView> {
  requireDurationRules(req, input.duration);
  await requireLoadType(tx, req.tenantId, id);
  const [row] = await tx
    .update(loadType)
    .set(input)
    .where(and(eq(loadType.tenantId, req.tenantId), eq(loadType.id, id)))
    .returning();
  if (!row) throw new ApiError(ErrorCode.not_found);
  const links = await resourceIdsOf(tx, req.tenantId, [id]);
  return view(row, links.get(id) ?? []);
}

export async function putLoadTypeResources(
  tx: Tx,
  tenantId: TenantId,
  id: LoadTypeId,
  resourceIds: readonly string[],
): Promise<LoadTypeView> {
  const lt = await requireLoadType(tx, tenantId, id);
  await setResources(tx, lt, resourceIds);
  return view(lt, [...resourceIds]);
}
