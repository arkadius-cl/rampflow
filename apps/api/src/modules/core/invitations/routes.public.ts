import { InvitationAcceptBody, TokenBody } from '@rampflow/shared/modules/core/api.auth';
import { Hono } from 'hono';
import { withScope } from '../../../db/scope.ts';
import { op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { sessionUser, tokenScope } from '../../../kernel/scopes.ts';
import { validate } from '../../../kernel/validate.ts';
import { startSession } from '../auth/sessions.ts';
import { acceptInvitation, inspectInvitation } from './accept.redeem.ts';

// Mounted at /api/public/invitations. The token travels in the body, never in the URL; the page
// reads it from the fragment of /invite#<token> (ADR-0011). Each route runs one transaction
// under the token's scope, so a failed acceptance leaves the invitation unused.

export const publicApi = new Hono<AppEnv>()
  .post(
    '/inspect',
    op({
      id: 'core.invitations.inspectInvitation',
      stories: ['PL-01', 'TN-01', 'CR-01', 'CR-04'],
      description:
        '`{ token }` → `{ orgKind, orgName, role, email, hasAccount }`; 401 when unknown, used, revoked or expired',
      responses: {},
    }),
    validate('json', TokenBody),
    async (c) => {
      const { token } = c.req.valid('json');
      const now = c.var.clock.now();
      const body = await withScope(tokenScope(token, null), (tx) =>
        inspectInvitation(tx, token, now),
      );
      return c.json(body, 200);
    },
  )
  .post(
    '/accept',
    op({
      id: 'core.invitations.acceptInvitation',
      stories: ['PL-01', 'TN-01', 'CR-01', 'CR-04'],
      description:
        "Runs with the token, then in the scope of the org. `{ token, name?, password?, locale? }` → `{ orgId, orgKind }`. A user signed in with the invited email just joins. Otherwise an email with an account answers 401 with `reason: 'sign_in_required'`; a new user needs `name` and `password` (422 without) and gets a verified account and a session. Gate and dock site lists become `membership_site` rows. 409 `already_member` leaves the invitation pending. Service: `acceptInvitation` in `core/invitations/accept.redeem.ts`",
      responses: {},
    }),
    validate('json', InvitationAcceptBody),
    async (c) => {
      const input = c.req.valid('json');
      const now = c.var.clock.now();
      const signedIn = await sessionUser(c);
      const accepted = await withScope(tokenScope(input.token, signedIn), async (tx) => {
        const result = await acceptInvitation(tx, { ...input, signedIn }, now);
        if (result.userId !== signedIn) await startSession(c, tx, result.userId, now);
        return result;
      });
      return c.json({ orgId: accepted.orgId, orgKind: accepted.orgKind }, 200);
    },
  );
