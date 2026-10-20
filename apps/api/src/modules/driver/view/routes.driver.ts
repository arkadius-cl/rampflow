import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import { ErrorCode, ScopeParty, StoryId } from '@rampflow/shared/values';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { DRIVER_COOKIE } from '../../../kernel/scopes.ts';
import { loadDriverView } from './view.ts';

/** Mounted at `/api/driver`. The PWA polls `/booking` every 15 s while visible (DR-03). */
export const driver = new Hono<AppEnv>().get(
  '/booking',
  op({
    id: 'driver.view.getBooking',
    stories: [StoryId.DR_01, StoryId.DR_03, StoryId.SF_04],
    description:
      '`DriverBookingView`: `asOf`, `channel`, tenant name and logo URL, site name, address lines, map link, zone and phone, code, status, slot and check-in and call instants, `dock` (`{ code, hall }` while called, at the dock or loading), safety `{ status, validUntil }`, `privacyNoticeUrl`, `linkExpiresAt`; polled every 15 s; writes nothing',
    responses: { 200: type<DriverBookingView>() },
  }),
  async (c) => {
    const { scope, db, access } = c.var;
    const token = getCookie(c, DRIVER_COOKIE);
    if (scope.party !== ScopeParty.driver || !token) throw new ApiError(ErrorCode.unauthorized);
    const view = await loadDriverView({
      tx: db,
      access,
      tenantId: scope.tenantId,
      bookingId: scope.bookingId,
      channel: scope.channel,
      token,
      now: c.var.clock.now(),
    });
    return c.json(view, 200);
  },
);
