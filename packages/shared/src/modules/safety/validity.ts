import { AckStatus, VersionStatus } from './values.ts';

/**
 * Whether a safety acknowledgement still covers a visit (SF-01, SF-04, YD-02). Pure, so the gate,
 * the driver PWA, reports and the register agree on one rule.
 */

export interface AcknowledgementFacts {
  /** Version number of the acknowledged instruction version. */
  version: number;
  bookingId: string | null;
  /** `null`: valid for its own visit only (`safety.validity_days` 0, or `safety.validity` off). */
  expiresAt: Date | null;
}

export interface ValidityContext {
  now: Date;
  /** The visit being checked; `null` when there is none, as in the register. */
  bookingId: string | null;
  /** From `materialFloor` over the instruction's versions. */
  materialFloor: number;
}

export interface VersionFacts {
  version: number;
  status: VersionStatus;
  materialChange: boolean;
}

/** The lowest version number still acknowledged validly: the newest material change ever published. */
export function materialFloor(versions: readonly VersionFacts[]): number {
  let floor = 0;
  for (const v of versions) {
    if (v.status !== VersionStatus.draft && v.materialChange && v.version > floor)
      floor = v.version;
  }
  return floor;
}

/**
 * `outdated`: a later version was published as a material change. `visit_only`: a per-visit
 * acknowledgement checked against another visit (or none). `expired`: past `expiresAt`.
 */
export function acknowledgementStatus(ack: AcknowledgementFacts, ctx: ValidityContext): AckStatus {
  if (ack.version < ctx.materialFloor) return AckStatus.outdated;
  if (ack.expiresAt === null) {
    return ack.bookingId !== null && ack.bookingId === ctx.bookingId
      ? AckStatus.valid
      : AckStatus.visit_only;
  }
  return ctx.now < ack.expiresAt ? AckStatus.valid : AckStatus.expired;
}

export function isAcknowledgementValid(ack: AcknowledgementFacts, ctx: ValidityContext): boolean {
  return acknowledgementStatus(ack, ctx) === AckStatus.valid;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Expiry of an acknowledgement completed at `completedAt`; 0 days means this visit only. */
export function expiresAtFor(completedAt: Date, validityDays: number): Date | null {
  return validityDays > 0 ? new Date(completedAt.getTime() + validityDays * DAY_MS) : null;
}
