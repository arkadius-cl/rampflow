import { randomUUID } from 'node:crypto';
import type { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { TokenPurpose } from '@rampflow/shared/values';
import { and, eq, isNull } from 'drizzle-orm';
import type { BookingId, CarrierId, SiteId, TenantId, UserId } from '../../db/ids.ts';
import { hashToken } from '../../db/ids.ts';
import type { Tx } from '../../db/scope.ts';
import { env } from '../../kernel/env.ts';
import { deriveToken } from '../../kernel/tokens.ts';
import { driverAccess } from './schema.ts';

// Driver links (ADR-0008): the token is HMAC(TOKEN_SECRET, "driver:<row id>"), the row stores
// only its hash, and an authorized caller recomputes the link from the row id on demand.

export type DriverAccessId = typeof driverAccess.$inferSelect.id;

const DAY_MS = 86_400_000;
/** A link stays valid until a week after the slot unless departure or a turn-away shortens it. */
export const LINK_VALID_AFTER_START_MS = 7 * DAY_MS;

export const linkExpiryFor = (startsAt: Date) =>
  new Date(startsAt.getTime() + LINK_VALID_AFTER_START_MS);

export interface LinkBooking {
  id: BookingId;
  tenantId: TenantId;
  siteId: SiteId;
  carrierId: CarrierId | null;
  startsAt: Date;
}

/** `https://<host>/d#<token>`: the token sits in the fragment, so no request line carries it. */
export function driverLinkUrl(id: DriverAccessId, origin = env.APP_ORIGIN): string {
  return `${origin.replace(/\/$/, '')}/d#${deriveToken(TokenPurpose.driver, id)}`;
}

/**
 * Inserts a driver access row. `link`: the booking's shareable link, one active per booking,
 * valid until `starts_at + 7 days`. `staff`: a gate-device briefing session (YD-02), 30 minutes.
 */
export async function issueDriverLink(
  tx: Tx,
  b: LinkBooking,
  o: { channel: DriverChannel; createdBy: UserId | null; expiresAt?: Date },
): Promise<{ id: DriverAccessId; url: string; expiresAt: Date }> {
  const id = randomUUID() as DriverAccessId;
  const expiresAt = o.expiresAt ?? linkExpiryFor(b.startsAt);
  await tx.insert(driverAccess).values({
    id,
    tenantId: b.tenantId,
    siteId: b.siteId,
    bookingId: b.id,
    carrierId: b.carrierId,
    tokenHash: hashToken(deriveToken(TokenPurpose.driver, id)),
    channel: o.channel,
    createdBy: o.createdBy,
    expiresAt,
  });
  return { id, url: driverLinkUrl(id), expiresAt };
}

const activeLinkOf = (bookingId: BookingId) =>
  and(
    eq(driverAccess.bookingId, bookingId),
    eq(driverAccess.channel, 'link'),
    isNull(driverAccess.revokedAt),
  );

/** The booking's active `link` row, or `null` after a cancel or before any was issued. */
export async function activeDriverLink(
  tx: Tx,
  bookingId: BookingId,
): Promise<{ id: DriverAccessId; expiresAt: Date } | null> {
  const [row] = await tx
    .select({ id: driverAccess.id, expiresAt: driverAccess.expiresAt })
    .from(driverAccess)
    .where(activeLinkOf(bookingId));
  return row ?? null;
}

/** Revokes the active `link` row at once (cancel, regenerate). */
export async function revokeDriverLink(tx: Tx, bookingId: BookingId, now: Date): Promise<void> {
  await tx.update(driverAccess).set({ revokedAt: now }).where(activeLinkOf(bookingId));
}

/** Moves the active link's expiry (reschedule, departure, turn-away). */
export async function setDriverLinkExpiry(
  tx: Tx,
  bookingId: BookingId,
  expiresAt: Date,
): Promise<void> {
  await tx.update(driverAccess).set({ expiresAt }).where(activeLinkOf(bookingId));
}
