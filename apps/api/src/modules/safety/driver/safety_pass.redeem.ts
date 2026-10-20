import type { BookingSafety } from '@rampflow/shared/modules/booking/api.staff';
import { sourceStates } from '@rampflow/shared/modules/booking/lifecycle';
import {
  BookingParty,
  type BookingStatus,
  CommandName,
  LinkVia,
} from '@rampflow/shared/modules/booking/values';
import { InstructionSafety } from '@rampflow/shared/modules/safety/values';
import { ErrorCode, ScopeParty, SystemActorName } from '@rampflow/shared/values';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { TokenHash } from '../../../db/ids.ts';
import { asScope, type Scope, type Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { systemActor } from '../../../kernel/system.ts';
import type { BookingContext } from '../../booking/lifecycle/context.ts';
import { bookingSafety, type SafetyTarget } from '../../booking/lifecycle/safety.ts';
import { transitionBooking } from '../../booking/lifecycle/transition.ts';
import {
  type AcknowledgementId,
  type InstructionId,
  safetyAcknowledgement,
  safetyPass,
} from '../schema.ts';

// The safety pass of ADR-0008. A driver session sees only its own booking's acknowledgements,
// but a pass points at an acknowledgement of an earlier visit, so these steps read and write as
// the tenant, inside the request transaction (ADR-0002).

const asTenant = (tenantId: SafetyTarget['tenantId']): Scope => ({
  party: ScopeParty.tenant,
  tenantId,
  siteIds: 'all',
  actor: systemActor(SystemActorName.safety_pass),
});

/**
 * The booking's safety status for the driver view. A redeemed pass links an acknowledgement
 * of another booking, which the driver scope cannot read. Reads only.
 */
export function driverSafety(
  tx: Tx,
  access: Access,
  target: SafetyTarget,
  now: Date,
): Promise<BookingSafety> {
  return asScope(tx, asTenant(target.tenantId), (inner) =>
    bookingSafety(inner, access, target, now),
  );
}

export interface PassInput {
  deviceHash: TokenHash;
  tenantId: SafetyTarget['tenantId'];
  instructionId: InstructionId;
  acknowledgementId: AcknowledgementId;
  /** A visit-only acknowledgement (`null`) never becomes a pass. */
  expiresAt: Date;
}

/** Remembers the acknowledgement on this phone for the tenant; a newer one replaces it. */
export async function keepPass(tx: Tx, pass: PassInput): Promise<void> {
  const { deviceHash, tenantId, instructionId, acknowledgementId, expiresAt } = pass;
  await asScope(tx, asTenant(tenantId), (inner) =>
    inner
      .insert(safetyPass)
      .values({ deviceHash, tenantId, instructionId, acknowledgementId, expiresAt })
      .onConflictDoUpdate({
        target: [safetyPass.deviceHash, safetyPass.tenantId, safetyPass.instructionId],
        set: { acknowledgementId, expiresAt },
      }),
  );
}

/**
 * SF-04: links this phone's valid passes to the booking for every instruction that still
 * lacks a valid acknowledgement. Linking runs through `transitionBooking` as the driver
 * (`link_acknowledgement`, via `pass`), so a repeat finds everything valid and writes nothing.
 * Returns how many acknowledgements it linked.
 */
export async function redeemPasses(
  ctx: BookingContext,
  target: SafetyTarget & { status: BookingStatus },
  deviceHash: TokenHash,
): Promise<number> {
  if (!sourceStates(CommandName.link_acknowledgement, BookingParty.driver).includes(target.status))
    return 0;
  const { tx, now } = ctx;
  return asScope(tx, asTenant(target.tenantId), async (inner) => {
    const safety = await bookingSafety(inner, ctx.access, target, now);
    const missing = new Set(
      safety.instructions
        .filter((i) => i.status === InstructionSafety.missing)
        .map((i) => i.instructionId),
    );
    if (missing.size === 0) return 0;
    const passes = await inner
      .select({
        instructionId: safetyPass.instructionId,
        acknowledgementId: safetyPass.acknowledgementId,
      })
      .from(safetyPass)
      .innerJoin(
        safetyAcknowledgement,
        and(
          eq(safetyAcknowledgement.id, safetyPass.acknowledgementId),
          eq(safetyAcknowledgement.tenantId, safetyPass.tenantId),
        ),
      )
      .where(
        and(
          eq(safetyPass.deviceHash, deviceHash),
          eq(safetyPass.tenantId, target.tenantId),
          gt(safetyPass.expiresAt, now),
          isNull(safetyAcknowledgement.restrictedAt),
        ),
      );
    let linked = 0;
    for (const pass of passes) {
      if (!missing.has(pass.instructionId)) continue;
      try {
        await transitionBooking({ ...ctx, tx: inner }, target.id, {
          type: CommandName.link_acknowledgement,
          acknowledgementId: pass.acknowledgementId,
          via: LinkVia.pass,
        });
        linked++;
      } catch (e) {
        // An acknowledgement outdated by a material change stays on the phone but links nothing.
        if (e instanceof ApiError && e.code === ErrorCode.conflict) continue;
        throw e;
      }
    }
    return linked;
  });
}
