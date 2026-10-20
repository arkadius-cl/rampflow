import { sourceStates } from '@rampflow/shared/modules/booking/lifecycle';
import { BookingParty } from '@rampflow/shared/modules/booking/values';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { acknowledgementStatus } from '@rampflow/shared/modules/safety/validity';
import { AckStatus } from '@rampflow/shared/modules/safety/values';
import type { AcknowledgementCandidate, BriefingSession } from '@rampflow/shared/modules/yard/api';
import { ConflictReason, ErrorCode } from '@rampflow/shared/values';
import { and, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import type { BookingId, UserId } from '../../db/ids.ts';
import { ApiError } from '../../kernel/errors.ts';
import type { BookingContext } from '../booking/lifecycle/context.ts';
import { booking } from '../booking/schema.ts';
import { issueDriverLink } from '../driver/access.ts';
import { applicableInstructions } from '../safety/authoring/published.ts';
import { safetyAcknowledgement, safetyVersion } from '../safety/schema.ts';

// YD-02: the gate links a briefing the driver already completed, found by driver name, or runs
// the briefing on the gate device through a short `staff` driver session.

const CANDIDATE_LIMIT = 20;
const BRIEFING_SESSION_MS = 30 * 60_000;
/** States in which a briefing can still be linked: the gate's `link_acknowledgement`. */
const LINKABLE = sourceStates('link_acknowledgement', BookingParty.staff);

async function linkableBooking(ctx: BookingContext, bookingId: BookingId) {
  const [b] = await ctx.tx
    .select()
    .from(booking)
    .where(and(eq(booking.id, bookingId), eq(booking.tenantId, ctx.tenantId)));
  if (!b) throw new ApiError(ErrorCode.not_found);
  if (!LINKABLE.includes(b.status)) {
    throw new ApiError(ErrorCode.conflict, 'The visit can no longer take a briefing', {
      reason: ConflictReason.invalid_transition,
      status: b.status,
    });
  }
  return b;
}

/** Acknowledgements of the tenant by driver name that would be valid for this visit. */
export async function acknowledgementCandidates(
  ctx: BookingContext,
  bookingId: BookingId,
  name: string,
): Promise<AcknowledgementCandidate[]> {
  const b = await linkableBooking(ctx, bookingId);
  const applicable = await applicableInstructions(ctx.tx, {
    tenantId: b.tenantId,
    siteId: b.siteId,
  });
  if (applicable.length === 0) return [];
  const rows = await ctx.tx
    .select({
      id: safetyAcknowledgement.id,
      driverName: safetyAcknowledgement.driverName,
      instructionId: safetyAcknowledgement.instructionId,
      locale: safetyAcknowledgement.locale,
      completedAt: safetyAcknowledgement.completedAt,
      expiresAt: safetyAcknowledgement.expiresAt,
      bookingId: safetyAcknowledgement.bookingId,
      version: safetyVersion.version,
    })
    .from(safetyAcknowledgement)
    .innerJoin(safetyVersion, eq(safetyVersion.id, safetyAcknowledgement.versionId))
    .where(
      and(
        eq(safetyAcknowledgement.tenantId, b.tenantId),
        inArray(
          safetyAcknowledgement.instructionId,
          applicable.map((i) => i.instructionId),
        ),
        isNull(safetyAcknowledgement.restrictedAt),
        isNull(safetyAcknowledgement.pseudonymizedAt),
        ilike(safetyAcknowledgement.driverName, `%${name.replace(/[\\%_]/g, '\\$&')}%`),
      ),
    )
    .orderBy(desc(safetyAcknowledgement.completedAt))
    .limit(CANDIDATE_LIMIT * 5);
  return rows
    .flatMap((r) => {
      const instruction = applicable.find((i) => i.instructionId === r.instructionId);
      if (!instruction) return [];
      const status = acknowledgementStatus(r, {
        now: ctx.now,
        bookingId: b.id,
        materialFloor: instruction.materialFloor,
      });
      if (status !== AckStatus.valid) return [];
      return [
        {
          id: r.id,
          driverName: r.driverName,
          instruction: { id: instruction.instructionId, name: instruction.name },
          locale: r.locale,
          completedAt: r.completedAt.toISOString(),
          expiresAt: r.expiresAt?.toISOString() ?? null,
        },
      ];
    })
    .slice(0, CANDIDATE_LIMIT);
}

/** A 30-minute `staff` driver session; its acknowledgements never set a safety pass (SF-04). */
export async function briefingSession(
  ctx: BookingContext,
  bookingId: BookingId,
  userId: UserId,
): Promise<BriefingSession> {
  const b = await linkableBooking(ctx, bookingId);
  const link = await issueDriverLink(ctx.tx, b, {
    channel: DriverChannel.staff,
    createdBy: userId,
    expiresAt: new Date(ctx.now.getTime() + BRIEFING_SESSION_MS),
  });
  return { url: link.url, expiresAt: link.expiresAt.toISOString() };
}
