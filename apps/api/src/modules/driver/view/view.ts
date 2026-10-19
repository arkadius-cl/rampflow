import { DOCK_HOLDING_STATUSES } from '@rampflow/shared/modules/booking/lifecycle';
import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import { and, eq } from 'drizzle-orm';
import { type BookingId, hashToken, type TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { booking } from '../../booking/schema.ts';
import { currentLogoUrl } from '../../brand/logo/logo.ts';
import { dock, hall, org, site } from '../../core/schema.ts';
import { driverSafety } from '../../safety/driver/safety_pass.redeem.ts';
import { driverAccess } from '../schema.ts';

export interface ViewRequest {
  tx: Tx;
  access: Access;
  tenantId: TenantId;
  bookingId: BookingId;
  channel: DriverBookingView['channel'];
  /** The `rf_driver` cookie, to read this link's own expiry. */
  token: string;
  now: Date;
}

const mapUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * DR-01, DR-03: what the driver's phone shows. Reads only, so 2,000 polling phones add no writes
 * (ADR-0008). Picks columns explicitly: the driver's name, phone and plate never leave here.
 */
export async function loadDriverView(r: ViewRequest): Promise<DriverBookingView> {
  const { tx, tenantId, bookingId, now } = r;
  const [row] = await tx
    .select({
      code: booking.code,
      status: booking.status,
      siteId: booking.siteId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      checkedInAt: booking.checkedInAt,
      calledAt: booking.calledAt,
      dockId: booking.dockId,
      tenantName: org.name,
      site: {
        name: site.name,
        addressLine1: site.addressLine1,
        addressLine2: site.addressLine2,
        postalCode: site.postalCode,
        city: site.city,
        country: site.country,
        timeZone: site.timeZone,
        phone: site.phone,
      },
    })
    .from(booking)
    .innerJoin(site, and(eq(site.id, booking.siteId), eq(site.tenantId, tenantId)))
    .innerJoin(org, eq(org.id, booking.tenantId))
    .where(and(eq(booking.id, bookingId), eq(booking.tenantId, tenantId)));
  if (!row) throw new ApiError('not_found');

  const [link] = await tx
    .select({ expiresAt: driverAccess.expiresAt })
    .from(driverAccess)
    .where(
      and(eq(driverAccess.bookingId, bookingId), eq(driverAccess.tokenHash, hashToken(r.token))),
    );
  if (!link) throw new ApiError('unauthorized');

  const holdsDock = (DOCK_HOLDING_STATUSES as readonly string[]).includes(row.status);
  const [called] =
    holdsDock && row.dockId
      ? await tx
          .select({ code: dock.code, hall: hall.name })
          .from(dock)
          .innerJoin(hall, eq(hall.id, dock.hallId))
          .where(and(eq(dock.id, row.dockId), eq(dock.tenantId, tenantId)))
      : [];

  const logoUrl = r.access.entitlements
    ? await currentLogoUrl(tx, tenantId, r.access.entitlements, '')
    : null;

  const safety = await driverSafety(
    tx,
    r.access,
    { id: bookingId, tenantId, siteId: row.siteId },
    now,
  );
  const expiries = safety.instructions.map((i) => i.expiresAt);
  const validUntil =
    safety.status === 'valid' && expiries.length > 0 && expiries.every((e) => e !== null)
      ? (expiries.sort()[0] ?? null)
      : null;

  const s = row.site;
  const addressLines = [
    s.addressLine1,
    s.addressLine2,
    `${s.postalCode} ${s.city}`,
    s.country,
  ].filter((l): l is string => !!l);
  const notice = await r.access.setting('privacy.notice_url', row.siteId);

  return {
    asOf: now.toISOString(),
    channel: r.channel,
    tenant: { name: row.tenantName, logoUrl },
    site: {
      name: s.name,
      addressLines,
      mapUrl: mapUrl(addressLines.join(', ')),
      timeZone: s.timeZone,
      phone: s.phone,
    },
    booking: {
      code: row.code,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      checkedInAt: row.checkedInAt?.toISOString() ?? null,
      calledAt: row.calledAt?.toISOString() ?? null,
    },
    dock: called ? { code: called.code, hall: called.hall } : null,
    safety: { status: safety.status, validUntil },
    privacyNoticeUrl: notice.value,
    linkExpiresAt: link.expiresAt.toISOString(),
  };
}
