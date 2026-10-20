import {
  CarrierInvitationAcceptBody,
  type CarrierInvitationInspect,
} from '@rampflow/shared/modules/booking/api.carriers';
import { TokenBody } from '@rampflow/shared/modules/core/api.auth';
import { StoryId, ValidationTarget } from '@rampflow/shared/values';
import { Hono } from 'hono';
import { withScope } from '../../../db/scope.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { sessionUser, tokenScope } from '../../../kernel/scopes.ts';
import { validate } from '../../../kernel/validate.ts';
import { startSession } from '../../core/auth/sessions.ts';
import { acceptCarrierInvitation, inspectCarrierInvitation } from './accept.redeem.ts';

// Mounted at /api/public/carrier-invitations (TN-03, CR-01). The page reads the token from the
// fragment of /carrier-invite#<token> and posts it; each route is one transaction under the
// token's scope, so a failed acceptance leaves the invitation unused.

export const publicApi = new Hono<AppEnv>()
  .post(
    '/inspect',
    op({
      id: 'booking.carriers.inspectCarrierInvitation',
      stories: [StoryId.TN_03, StoryId.CR_01],
      description:
        '`{ token }` → `{ tenantName, logoUrl, companyName, email, hasAccount }`; `logoUrl` as for `/api/public/links/:slug`',
      responses: { 200: type<CarrierInvitationInspect>() },
    }),
    validate(ValidationTarget.json, TokenBody),
    async (c) => {
      const { token } = c.req.valid('json');
      const now = c.var.clock.now();
      const body = await withScope(tokenScope(token, null), (tx) =>
        inspectCarrierInvitation(tx, token, now),
      );
      return c.json(body, 200);
    },
  )
  .post(
    '/accept',
    op({
      id: 'booking.carriers.acceptCarrierInvitation',
      stories: [StoryId.TN_03, StoryId.CR_01],
      description:
        "Runs with the token, then in the scope of the user. `{ token, name?, password?, companyName?, locale? }` → `{ carrierId }`. A new user needs `name` and `password` (422 without) and becomes carrier admin of a new org; a user signed in with the invited email links the carrier org they administer, and one who is only `carrier_user` answers 403 `forbidden` with `reason: 'carrier_admin_required'` and leaves the invitation pending; an email with an account answers 401 `sign_in_required` with `email`. The link is active, also when the tenant deactivated it before sending this invitation; a deactivation after it stays. Single use, 7 days. Service: `acceptCarrierInvitation` in `accept.redeem.ts`",
      responses: {},
    }),
    validate(ValidationTarget.json, CarrierInvitationAcceptBody),
    async (c) => {
      const input = c.req.valid('json');
      const now = c.var.clock.now();
      const signedIn = await sessionUser(c);
      const accepted = await withScope(tokenScope(input.token, signedIn), async (tx) => {
        const result = await acceptCarrierInvitation(tx, { ...input, signedIn }, now);
        if (result.userId !== signedIn) await startSession(c, tx, result.userId, now);
        return result;
      });
      return c.json({ carrierId: accepted.carrierId }, 200);
    },
  );
