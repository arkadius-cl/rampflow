import { zValidator } from '@hono/zod-validator';
import { InvitationAcceptBody, TokenBody } from '@rampflow/shared/modules/core/api.auth';
import { Hono } from 'hono';
import { withScope } from '../../../db/scope.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { sessionUser, tokenScope } from '../../../kernel/scopes.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { startSession } from '../auth/sessions.ts';
import { acceptInvitation, inspectInvitation } from './accept.redeem.ts';

// Mounted at /api/public/invitations. The token travels in the body, never in the URL; the page
// reads it from the fragment of /invite#<token> (ADR-0011). Each route runs one transaction
// under the token's scope, so a failed acceptance leaves the invitation unused.

export const publicApi = new Hono<AppEnv>()
  .post('/inspect', zValidator('json', TokenBody, onInvalid), async (c) => {
    const { token } = c.req.valid('json');
    const now = c.var.clock.now();
    const body = await withScope(tokenScope(token, null), (tx) =>
      inspectInvitation(tx, token, now),
    );
    return c.json(body, 200);
  })
  .post('/accept', zValidator('json', InvitationAcceptBody, onInvalid), async (c) => {
    const input = c.req.valid('json');
    const now = c.var.clock.now();
    const signedIn = await sessionUser(c);
    const accepted = await withScope(tokenScope(input.token, signedIn), async (tx) => {
      const result = await acceptInvitation(tx, { ...input, signedIn }, now);
      if (result.userId !== signedIn) await startSession(c, tx, result.userId, now);
      return result;
    });
    return c.json({ orgId: accepted.orgId, orgKind: accepted.orgKind }, 200);
  });
