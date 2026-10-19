import { zValidator } from '@hono/zod-validator';
import {
  RegistrationBody,
  RegistrationVerifyBody,
} from '@rampflow/shared/modules/booking/api.carriers';
import { Hono } from 'hono';
import * as z from 'zod';
import { withScope } from '../../../db/scope.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { sessionUser, tokenScope } from '../../../kernel/scopes.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { startSession } from '../../core/auth/sessions.ts';
import { openPublicLink, publicScope, resolveSlug } from './public-links.ts';
import { submitRegistration } from './registrations.ts';
import { verifyRegistration } from './verify.redeem.ts';

// Mounted at /api/public (CR-02, TN-04). `/links/:slug` runs under the public scope of the
// slug's tenant and site; `/registrations/verify` under the token scope of the emailed token.

const SlugParam = z.object({ slug: z.string().regex(/^[a-z2-7]{10}$/) });

export const publicApi = new Hono<AppEnv>()
  .get('/links/:slug', zValidator('param', SlugParam, onInvalid), async (c) => {
    const link = await resolveSlug(c.req.valid('param').slug);
    const { info } = await withScope(publicScope(link), (tx) =>
      openPublicLink(tx, link, c.var.clock),
    );
    return c.json(info, 200);
  })
  .post(
    '/links/:slug/registrations',
    zValidator('param', SlugParam, onInvalid),
    zValidator('json', RegistrationBody, onInvalid),
    async (c) => {
      const link = await resolveSlug(c.req.valid('param').slug);
      const now = c.var.clock.now();
      await withScope(publicScope(link), async (tx) => {
        const { info, access } = await openPublicLink(tx, link, c.var.clock);
        await submitRegistration(tx, {
          link,
          info,
          body: c.req.valid('json'),
          entitlements: access.entitlements,
          now,
        });
      });
      return c.body(null, 202);
    },
  )
  .post(
    '/registrations/verify',
    zValidator('json', RegistrationVerifyBody, onInvalid),
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
