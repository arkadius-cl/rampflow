import {
  type PublicLinkInfo,
  RegistrationBody,
} from '@rampflow/shared/modules/booking/api.carriers';
import { TokenBody } from '@rampflow/shared/modules/core/api.auth';
import { StoryId } from '@rampflow/shared/values';
import { Hono } from 'hono';
import * as z from 'zod';
import { withScope } from '../../../db/scope.ts';
import { noBody, op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { clientIp } from '../../../kernel/rate-limit.ts';
import { sessionUser, tokenScope } from '../../../kernel/scopes.ts';
import { validate } from '../../../kernel/validate.ts';
import { startSession } from '../../core/auth/sessions.ts';
import { openPublicLink, publicScope, resolveSlug } from './public-links.ts';
import { registrationAllowed, submitRegistration } from './registrations.ts';
import { verifyRegistration } from './verify.redeem.ts';

// Mounted at /api/public (CR-02, TN-04). `/links/:slug` runs under the public scope of the
// slug's tenant and site; `/registrations/verify` under the token scope of the emailed token.

const SlugParam = z.object({ slug: z.string().regex(/^[a-z2-7]{10}$/) });

export const publicApi = new Hono<AppEnv>()
  .get(
    '/links/:slug',
    op({
      id: 'booking.registration.getPublicLink',
      stories: [StoryId.CR_02, StoryId.TN_04],
      description:
        "Needs the tenant's `booking.public_link` and the site's `booking.public_link_enabled`. `{ tenantName, siteName, city, country, logoUrl }` (`logoUrl` is `null` without a logo or while `brand.logo` is off). 404 for an unknown or revoked slug, the feature or the site setting off, or an inactive site. The setting is the only on and off switch; the slug only names the link",
      responses: { 200: type<PublicLinkInfo>() },
    }),
    validate('param', SlugParam),
    async (c) => {
      const link = await resolveSlug(c.req.valid('param').slug);
      const { info } = await withScope(publicScope(link), (tx) =>
        openPublicLink(tx, link, c.var.clock),
      );
      return c.json(info, 200);
    },
  )
  .post(
    '/links/:slug/registrations',
    op({
      id: 'booking.registration.createRegistration',
      stories: [StoryId.CR_02],
      description:
        "Needs the tenant's `booking.public_link` and the site's `booking.public_link_enabled`. `{ companyName, country, contactName, email, locale? }`; always 202 with an empty body. A known email gets a sign-in prompt by email instead of the verification text, both with the single-use `/carrier-registration#<token>` link, so the response never reveals an account. Limits `registration_request` (5 per hour per email) and `registration_ip` (100 per hour per client address); over either the answer is the same 202 and nothing is written",
      responses: { 202: noBody },
    }),
    validate('param', SlugParam),
    validate('json', RegistrationBody),
    async (c) => {
      const { slug } = c.req.valid('param');
      const link = await resolveSlug(slug);
      const body = c.req.valid('json');
      const now = c.var.clock.now();
      const { info, entitlements } = await withScope(publicScope(link), async (tx) => {
        const opened = await openPublicLink(tx, link, c.var.clock);
        return { info: opened.info, entitlements: opened.access.entitlements };
      });
      if (await registrationAllowed(body.email, clientIp(c), now)) {
        await withScope(publicScope(link), (tx) =>
          submitRegistration(tx, { link, slug, info, body, entitlements, now }),
        );
      }
      return c.body(null, 202);
    },
  )
  .post(
    '/registrations/verify',
    op({
      id: 'booking.registration.verifyRegistration',
      stories: [StoryId.CR_02],
      description:
        "`{ token }` → `{ carrierId, status }`; verifies the email, signs in, applies `booking.public_registration_mode`. A new email gets a verified account without password and a new carrier org; a known email answers 401 `sign_in_required` with `email` until that user is signed in, then attaches to the carrier org they administer; a user who is only `carrier_user` somewhere answers 403 `forbidden` with `reason: 'carrier_admin_required'` and the registration stays unverified. `auto_approve` links at once but leaves a link the tenant deactivated off. Single use, 24 hours; 401 once the site switched the public link off, the feature or site is off, or the slug the form came through was regenerated. Service: `verifyRegistration` in `verify.redeem.ts`",
      responses: {},
    }),
    validate('json', TokenBody),
    async (c) => {
      const { token } = c.req.valid('json');
      const signedIn = await sessionUser(c);
      const now = c.var.clock.now();
      const verified = await withScope(tokenScope(token, signedIn), async (tx) => {
        const result = await verifyRegistration(tx, { token, signedIn }, c.var.clock);
        if (result.userId !== signedIn) await startSession(c, tx, result.userId, now);
        return result;
      });
      return c.json({ carrierId: verified.carrierId, status: verified.status }, 200);
    },
  );
