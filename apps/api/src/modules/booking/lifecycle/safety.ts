import type { BookingSafety } from '@rampflow/shared/modules/booking/api.staff';
import { acknowledgementStatus } from '@rampflow/shared/modules/safety/validity';
import { AckStatus, InstructionSafety, SafetyStatus } from '@rampflow/shared/modules/safety/values';
import { Feature, Setting } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { BookingId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { applicableInstructions } from '../../safety/authoring/published.ts';
import {
  bookingAcknowledgement,
  safetyAcknowledgement,
  safetyVersion,
} from '../../safety/schema.ts';

export interface SafetyTarget {
  id: BookingId;
  tenantId: TenantId;
  siteId: SiteId;
}

/** Whether `check_in` refuses a missing acknowledgement (YD-02, booking lifecycle `check_in`). */
export async function safetyEnforced(access: Access, siteId: SiteId): Promise<boolean> {
  if (!access.entitlements?.features[Feature.safety.gate_enforcement]) return false;
  return (await access.setting(Setting.safety.require_for_checkin, siteId)).value;
}

/**
 * The safety status of a visit: every published instruction that applies to the site needs a
 * linked acknowledgement that is valid for this booking (`acknowledgementStatus` of U5).
 */
export async function bookingSafety(
  tx: Tx,
  access: Access,
  b: SafetyTarget,
  now: Date,
): Promise<BookingSafety> {
  const enforced = await safetyEnforced(access, b.siteId);
  if (!access.entitlements?.modules.safety) {
    return { status: SafetyStatus.not_required, enforced: false, instructions: [] };
  }
  const applicable = await applicableInstructions(tx, { tenantId: b.tenantId, siteId: b.siteId });
  if (applicable.length === 0)
    return { status: SafetyStatus.not_required, enforced, instructions: [] };
  const linked = await tx
    .select({
      instructionId: bookingAcknowledgement.instructionId,
      acknowledgementId: safetyAcknowledgement.id,
      bookingId: safetyAcknowledgement.bookingId,
      expiresAt: safetyAcknowledgement.expiresAt,
      restrictedAt: safetyAcknowledgement.restrictedAt,
      version: safetyVersion.version,
    })
    .from(bookingAcknowledgement)
    .innerJoin(
      safetyAcknowledgement,
      and(
        eq(safetyAcknowledgement.id, bookingAcknowledgement.acknowledgementId),
        eq(safetyAcknowledgement.tenantId, b.tenantId),
      ),
    )
    .innerJoin(safetyVersion, eq(safetyVersion.id, safetyAcknowledgement.versionId))
    .where(eq(bookingAcknowledgement.bookingId, b.id));
  const instructions = applicable.map((i) => {
    const link = linked.find((l) => l.instructionId === i.instructionId);
    const valid =
      link !== undefined &&
      link.restrictedAt === null &&
      acknowledgementStatus(link, { now, bookingId: b.id, materialFloor: i.materialFloor }) ===
        AckStatus.valid;
    return {
      instructionId: i.instructionId,
      name: i.name,
      status: valid ? InstructionSafety.valid : InstructionSafety.missing,
      acknowledgementId: link?.acknowledgementId ?? null,
      expiresAt: link?.expiresAt?.toISOString() ?? null,
    };
  });
  const status = instructions.every((i) => i.status === InstructionSafety.valid)
    ? 'valid'
    : 'missing';
  return { status, enforced, instructions };
}
