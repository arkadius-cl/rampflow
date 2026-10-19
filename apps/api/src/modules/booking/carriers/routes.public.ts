import { zValidator } from '@hono/zod-validator';
import { CarrierInvitationAcceptBody } from '@rampflow/shared/modules/booking/api.carriers';
import { TokenBody } from '@rampflow/shared/modules/core/api.auth';
import { Hono } from 'hono';
import { withScope } from '../../../db/scope.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { sessionUser, tokenScope } from '../../../kernel/scopes.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { startSession } from '../../core/auth/sessions.ts';
import { acceptCarrierInvitation, inspectCarrierInvitation } from './accept.redeem.ts';

// Mounted at /api/public/carrier-invitations (TN-03, CR-01). The page reads the token from the
// fragment of /carrier-invite#<token> and posts it; each route is one transaction under the
// token's scope, so a failed acceptance leaves the invitation unused.

export const publicApi = new Hono<AppEnv>()
  .post('/inspect', zValidator('json', TokenBody, onInvalid), async (c) => {
    const { token } = c.req.valid('json');
    const now = c.var.clock.now();
    const body = await withScope(tokenScope(token, null), (tx) =>
      inspectCarrierInvitation(tx, token, now),
    );
    return c.json(body, 200);
  })
  .post('/accept', zValidator('json', CarrierInvitationAcceptBody, onInvalid), async (c) => {
    const input = c.req.valid('json');
    const now = c.var.clock.now();
    const signedIn = await sessionUser(c);
    const accepted = await withScope(tokenScope(input.token, signedIn), async (tx) => {
      const result = await acceptCarrierInvitation(tx, { ...input, signedIn }, now);
      if (result.userId !== signedIn) await startSession(c, tx, result.userId, now);
      return result;
    });
    return c.json({ carrierId: accepted.carrierId }, 200);
  });
