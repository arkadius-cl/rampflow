import type { SafetyLocale } from '@rampflow/shared/modules/safety/api.authoring';
import type {
  RegisterFilter,
  RegisterItem,
  RegisterPage,
} from '@rampflow/shared/modules/safety/api.register';
import { acknowledgementStatus, expiresAtFor } from '@rampflow/shared/modules/safety/validity';
import { and, desc, eq, gt, ilike, isNull, lte, type SQL, sql } from 'drizzle-orm';
import * as z from 'zod';
import type { BookingId, CarrierId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { booking } from '../../booking/schema.ts';
import { site } from '../../core/schema.ts';
import { publishedContent } from '../authoring/published.ts';
import {
  type AcknowledgementId,
  type InstructionId,
  safetyAcknowledgement,
  safetyInstruction,
  safetyVersion,
  type VersionId,
} from '../schema.ts';

/** Days an acknowledgement completed at this site stays valid; 0 while `safety.validity` is off. */
export async function validityDays(access: Access, siteId: SiteId): Promise<number> {
  if (!access.entitlements?.features['safety.validity']) return 0;
  return (await access.setting('safety.validity_days', siteId)).value;
}

export interface RecordAcknowledgementInput {
  tenantId: TenantId;
  bookingId: BookingId;
  carrierId: CarrierId | null;
  instructionId: InstructionId;
  locale: SafetyLocale;
  driverName: string;
  channel: 'link' | 'staff';
  /** Percent of the last quiz attempt; `null` without a quiz. */
  score: number | null;
  attempts: number;
  completedAt: Date;
  /** From `validityDays`. */
  validityDays: number;
}

export interface RecordedAcknowledgement {
  id: AcknowledgementId;
  versionId: VersionId;
  expiresAt: Date | null;
}

/**
 * SF-04: stores the acknowledgement of the published version in the driver's locale, with that
 * content's hash and statement. Linking it to the booking is the lifecycle command
 * `link_acknowledgement` (booking lifecycle), which also writes the `safety_linked` event.
 * 404 when the instruction has no published content in the locale.
 */
export async function recordAcknowledgement(
  tx: Tx,
  input: RecordAcknowledgementInput,
): Promise<RecordedAcknowledgement> {
  const { tenantId, instructionId, locale, bookingId } = input;
  const content = await publishedContent(tx, { tenantId, instructionId, locale });
  if (!content) throw new ApiError('not_found', 'No published content in this locale');
  const expiresAt = expiresAtFor(input.completedAt, input.validityDays);
  const [ack] = await tx
    .insert(safetyAcknowledgement)
    .values({
      tenantId,
      instructionId,
      versionId: content.versionId,
      locale,
      contentHash: content.contentHash,
      bookingId,
      carrierId: input.carrierId,
      driverName: input.driverName,
      statementShown: content.statement,
      channel: input.channel,
      score: input.score,
      attempts: input.attempts,
      completedAt: input.completedAt,
      expiresAt,
    })
    .returning({ id: safetyAcknowledgement.id });
  if (!ack) throw new Error('safety_acknowledgement insert returned no row');
  return { id: ack.id, versionId: content.versionId, expiresAt };
}

const a = safetyAcknowledgement;

/** The newest material version of the acknowledged instruction (`materialFloor`), in SQL. */
const floorSql = sql<number>`coalesce((
  select max(fv.version) from ${safetyVersion} fv
  where fv.instruction_id = ${a.instructionId} and fv.material_change and fv.status <> 'draft'
), 0)`.mapWith(Number);

/** `acknowledgementStatus` with no visit in context, as a predicate. */
function statusSql(status: NonNullable<RegisterFilter['status']>, now: Date): SQL | undefined {
  const current = sql`${safetyVersion.version} >= ${floorSql}`;
  switch (status) {
    case 'outdated':
      return sql`${safetyVersion.version} < ${floorSql}`;
    case 'visit_only':
      return and(current, isNull(a.expiresAt));
    case 'expired':
      return and(current, lte(a.expiresAt, now));
    case 'valid':
      return and(current, gt(a.expiresAt, now));
  }
}

const Cursor = z.object({ t: z.iso.datetime(), id: z.uuid() });

const encodeCursor = (row: { completedAt: Date; id: string }) =>
  Buffer.from(JSON.stringify({ t: row.completedAt.toISOString(), id: row.id })).toString(
    'base64url',
  );

function decodeCursor(cursor: string) {
  try {
    return Cursor.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new ApiError('validation_failed', 'Invalid cursor', {
      issues: [{ path: ['cursor'], code: 'custom', message: 'Invalid cursor' }],
    });
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

interface Query {
  tenantId: TenantId;
  filter: RegisterFilter;
  now: Date;
  limit: number;
  cursor?: string;
}

/** Restricted acknowledgements (TN-06) stay stored but leave the register. */
async function queryRegister(tx: Tx, q: Query): Promise<RegisterItem[]> {
  const { tenantId, filter, now } = q;
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const rows = await tx
    .select({
      ack: a,
      version: safetyVersion.version,
      floor: floorSql,
      instructionName: safetyInstruction.name,
      bookingCode: booking.code,
      carrierName: booking.carrierName,
      siteId: site.id,
      siteName: site.name,
      timeZone: site.timeZone,
    })
    .from(a)
    .innerJoin(safetyVersion, eq(safetyVersion.id, a.versionId))
    .innerJoin(safetyInstruction, eq(safetyInstruction.id, a.instructionId))
    .leftJoin(booking, and(eq(booking.id, a.bookingId), eq(booking.tenantId, tenantId)))
    .leftJoin(site, and(eq(site.id, booking.siteId), eq(site.tenantId, tenantId)))
    .where(
      and(
        eq(a.tenantId, tenantId),
        isNull(a.restrictedAt),
        filter.siteId ? eq(booking.siteId, filter.siteId as SiteId) : undefined,
        filter.carrierId ? eq(a.carrierId, filter.carrierId as CarrierId) : undefined,
        filter.driverName ? ilike(a.driverName, `%${escapeLike(filter.driverName)}%`) : undefined,
        filter.instructionId
          ? eq(a.instructionId, filter.instructionId as InstructionId)
          : undefined,
        filter.versionId ? eq(a.versionId, filter.versionId as VersionId) : undefined,
        filter.status ? statusSql(filter.status, now) : undefined,
        after ? sql`(${a.completedAt}, ${a.id}) < (${new Date(after.t)}, ${after.id})` : undefined,
      ),
    )
    .orderBy(desc(a.completedAt), desc(a.id))
    .limit(q.limit);
  return rows.map(({ ack, ...r }) => ({
    id: ack.id,
    completedAt: ack.completedAt.toISOString(),
    expiresAt: ack.expiresAt?.toISOString() ?? null,
    status: acknowledgementStatus(
      { version: r.version, bookingId: ack.bookingId, expiresAt: ack.expiresAt },
      { now, bookingId: null, materialFloor: r.floor },
    ),
    driverName: ack.driverName,
    channel: ack.channel,
    locale: ack.locale as SafetyLocale,
    score: ack.score,
    attempts: ack.attempts,
    instruction: { id: ack.instructionId, name: r.instructionName },
    version: { id: ack.versionId, version: r.version },
    booking:
      ack.bookingId && r.bookingCode !== null && r.carrierName !== null
        ? { id: ack.bookingId, code: r.bookingCode, carrierName: r.carrierName }
        : null,
    carrierId: ack.carrierId,
    site:
      r.siteId && r.siteName !== null && r.timeZone !== null
        ? { id: r.siteId, name: r.siteName, timeZone: r.timeZone }
        : null,
  }));
}

/** SF-03: newest first, cursor-paginated. */
export async function searchRegister(tx: Tx, q: Query): Promise<RegisterPage> {
  const items = await queryRegister(tx, { ...q, limit: q.limit + 1 });
  const page = items.slice(0, q.limit);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor:
      items.length > q.limit && last
        ? encodeCursor({ completedAt: new Date(last.completedAt), id: last.id })
        : null,
  };
}

/** Upper bound of one CSV export. */
export const CSV_MAX_ROWS = 50_000;

export function exportRegister(tx: Tx, q: Omit<Query, 'limit' | 'cursor'>) {
  return queryRegister(tx, { ...q, limit: CSV_MAX_ROWS });
}
