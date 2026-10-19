import type { ClosureView, CreateClosure } from '@rampflow/shared/modules/booking/api.capacity';
import { addDays, type LocalDate, type LocalDateTime } from '@rampflow/shared/time';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { requireSite } from '../../core/sites/sites.ts';
import type { TenantRequest } from '../../core/sites/tenant.ts';
import { bookableResource, closure, type ResourceId } from '../schema.resources.ts';

type ClosureRow = typeof closure.$inferSelect;
export type ClosureId = ClosureRow['id'];

const localDateTime = (t: string) => t.slice(0, 16).replace(' ', 'T') as LocalDateTime;

const view = (row: ClosureRow): ClosureView => ({
  id: row.id,
  siteId: row.siteId,
  resourceId: row.resourceId,
  kind: row.kind,
  startsLocal: localDateTime(row.startsLocal),
  endsLocal: localDateTime(row.endsLocal),
  reason: row.reason,
  source: row.source,
  holidayDate: row.holidayDate as LocalDate | null,
  holidayName: row.holidayName,
  reopenedAt: row.reopenedAt?.toISOString() ?? null,
});

/** Closures of a site that overlap the local dates `[from, to]`, holidays included. */
export async function listClosures(
  tx: Tx,
  tenantId: TenantId,
  q: { siteId: SiteId; from: LocalDate; to: LocalDate },
): Promise<ClosureView[]> {
  await requireSite(tx, tenantId, q.siteId);
  const rows = await tx
    .select()
    .from(closure)
    .where(
      and(
        eq(closure.tenantId, tenantId),
        eq(closure.siteId, q.siteId),
        lt(closure.startsLocal, `${addDays(q.to, 1)}T00:00`),
        gt(closure.endsLocal, `${q.from}T00:00`),
      ),
    )
    .orderBy(closure.startsLocal);
  return rows.map(view);
}

/** A manual closure or block; it never touches bookings, the plan board flags them (MD-03). */
export async function createClosure(
  tx: Tx,
  req: TenantRequest,
  input: CreateClosure,
): Promise<ClosureView> {
  const siteId = input.siteId as SiteId;
  await requireSite(tx, req.tenantId, siteId);
  const resourceId = input.resourceId as ResourceId | null;
  if (resourceId) {
    const [resource] = await tx
      .select({ id: bookableResource.id })
      .from(bookableResource)
      .where(
        and(
          eq(bookableResource.tenantId, req.tenantId),
          eq(bookableResource.siteId, siteId),
          eq(bookableResource.id, resourceId),
        ),
      );
    if (!resource) throw new ApiError('not_found');
  }
  const [row] = await tx
    .insert(closure)
    .values({
      tenantId: req.tenantId,
      siteId,
      resourceId,
      kind: input.kind,
      startsLocal: input.startsLocal,
      endsLocal: input.endsLocal,
      reason: input.reason ?? null,
      source: 'manual',
      createdBy: req.userId,
    })
    .returning();
  if (!row) throw new Error('closure insert returned nothing');
  return view(row);
}

async function requireClosure(tx: Tx, tenantId: TenantId, id: ClosureId): Promise<ClosureRow> {
  const [row] = await tx
    .select()
    .from(closure)
    .where(and(eq(closure.tenantId, tenantId), eq(closure.id, id)));
  if (!row) throw new ApiError('not_found');
  return row;
}

/** Manual closures only: a holiday is reopened instead, so the import never brings it back. */
export async function deleteClosure(tx: Tx, tenantId: TenantId, id: ClosureId): Promise<void> {
  const row = await requireClosure(tx, tenantId, id);
  if (row.source === 'holiday') {
    throw new ApiError('conflict', 'Reopen a holiday instead of deleting it', {
      reason: 'holiday_closure',
    });
  }
  await tx.delete(closure).where(and(eq(closure.tenantId, tenantId), eq(closure.id, id)));
}

/** MD-04: the admin reopens a public holiday. Repeating it changes nothing. */
export async function reopenHoliday(
  tx: Tx,
  tenantId: TenantId,
  id: ClosureId,
  now: Date,
): Promise<ClosureView> {
  const row = await requireClosure(tx, tenantId, id);
  if (row.source !== 'holiday') {
    throw new ApiError('conflict', 'Only holiday closures are reopened; delete this one', {
      reason: 'manual_closure',
    });
  }
  if (row.reopenedAt) return view(row);
  const [updated] = await tx
    .update(closure)
    .set({ reopenedAt: now })
    .where(and(eq(closure.tenantId, tenantId), eq(closure.id, id)))
    .returning();
  if (!updated) throw new ApiError('not_found');
  return view(updated);
}
