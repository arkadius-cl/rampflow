import * as z from 'zod';
import type { BookingStatus } from '../booking/lifecycle.ts';

// The driver PWA's booking API (DR-01, DR-03, ADR-0008). No driver name, phone or plate leaves
// the server through these shapes.

/** The link token from `/d#<token>`: base64url of 32 bytes. */
export const ExchangeBody = z.object({ token: z.string().min(1).max(128) });
export type ExchangeBody = z.infer<typeof ExchangeBody>;

export type DriverChannel = 'link' | 'staff';

/** `GET /api/driver/booking`, polled every 15 s. */
export interface DriverBookingView {
  /** Server time of this answer; the PWA shows it while offline. */
  asOf: string;
  /** `staff`: a gate-device briefing session (YD-02). */
  channel: DriverChannel;
  tenant: { name: string; logoUrl: string | null };
  site: {
    name: string;
    addressLines: string[];
    mapUrl: string;
    timeZone: string;
    phone: string | null;
  };
  booking: {
    code: string;
    status: BookingStatus;
    startsAt: string;
    endsAt: string;
    checkedInAt: string | null;
    calledAt: string | null;
  };
  /** Set while the truck is called or at the dock. */
  dock: { code: string; hall: string } | null;
  safety: {
    status: 'valid' | 'missing' | 'not_required';
    /** The earliest expiry of the linked acknowledgements; `null` for this visit only. */
    validUntil: string | null;
  };
  /** `null`: the platform template. */
  privacyNoticeUrl: string | null;
  linkExpiresAt: string;
}
