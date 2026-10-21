import { TokenBody } from '@rampflow/shared/modules/core/api.auth';
import {
  SignupBody,
  type SignupChallenge,
  type SignupInspect,
  type SignupVerified,
} from '@rampflow/shared/modules/core/api.signup';
import { SignupIssue } from '@rampflow/shared/modules/core/values';
import { ErrorCode, ScopeParty, StoryId, ValidationTarget } from '@rampflow/shared/values';
import { Hono } from 'hono';
import { withScope } from '../../../db/scope.ts';
import { noBody, op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { clientIp } from '../../../kernel/rate-limit.ts';
import { sessionUser, tokenScope } from '../../../kernel/scopes.ts';
import { validate } from '../../../kernel/validate.ts';
import { hashPassword } from '../auth/password.ts';
import { startSession } from '../auth/sessions.ts';
import { createSignupChallenge, verifySignupSolution } from './altcha.ts';
import { isDisposable } from './disposable-domains.ts';
import { signupAllowed, submitSignup } from './signups.ts';
import { inspectSignup, verifySignup } from './verify.redeem.ts';

// Mounted at /api/public/signups (RG-01 to RG-04). No route has a tenant yet: the challenge
// needs no transaction, the registration runs under the anonymous scope, inspect and verify
// under the token scope of the emailed token.

const invalid = (field: string, code: SignupIssue, message: string) =>
  new ApiError(ErrorCode.validation_failed, 'Invalid json', {
    issues: [{ path: [field], code, message }],
  });

export const publicApi = new Hono<AppEnv>()
  .get(
    '/challenge',
    op({
      id: 'core.signup.getChallenge',
      stories: [StoryId.RG_01],
      description:
        'A signed ALTCHA proof-of-work challenge for the registration form, valid for 10 minutes. The widget solves it in the browser and sends the result as `altcha`; no cookie, no third party',
      responses: { 200: type<SignupChallenge>() },
    }),
    async (c) => c.json(await createSignupChallenge(c.var.clock.now()), 200),
  )
  .post(
    '/',
    op({
      id: 'core.signup.createSignup',
      stories: [StoryId.RG_01, StoryId.RG_03],
      description:
        '`SignupBody`; always 202 with an empty body once valid. 422 at `altcha` (`altcha_failed`) for a missing, wrong, expired or reused solution, at `email` (`disposable_email`) for a disposable domain, at `taxIdType` or `taxIdValue` (`tax_id_format`, `tax_id_checksum`, `tax_id_country`) for the tax id. A new email gets a pending registration and the `/signup/verify#<token>` email, superseding its earlier one; a known email gets a "you already have an account" email and no row. Limits `signup_request` (3 per hour per email) and `signup_ip` (20 per hour per client address); over either the answer is the same 202 and nothing is written',
      responses: { 202: noBody },
    }),
    validate(ValidationTarget.json, SignupBody),
    async (c) => {
      const body = c.req.valid('json');
      const now = c.var.clock.now();
      if (!(await verifySignupSolution(body.altcha, now))) {
        throw invalid('altcha', SignupIssue.altcha_failed, 'Proof of work missing or invalid');
      }
      if (isDisposable(body.email)) {
        throw invalid('email', SignupIssue.disposable_email, 'Disposable addresses are refused');
      }
      if (await signupAllowed(body.email, clientIp(c), now)) {
        const passwordHash = await hashPassword(body.password);
        await withScope({ party: ScopeParty.anonymous }, (tx) =>
          submitSignup(tx, { body, passwordHash, now }),
        );
      }
      return c.body(null, 202);
    },
  )
  .post(
    '/inspect',
    op({
      id: 'core.signup.inspectSignup',
      stories: [StoryId.RG_02, StoryId.RG_04],
      description:
        '`{ token }` → `{ email, companyName, possibleDuplicate }` for the verify page, before the click. Does not use the link. `possibleDuplicate` is true when another tenant has an equivalent tax id or a member at the same non-free-mail domain; it names no tenant. 401 for an unknown, used, superseded or expired link. Service: `inspectSignup` in `verify.redeem.ts`',
      responses: { 200: type<SignupInspect>() },
    }),
    validate(ValidationTarget.json, TokenBody),
    async (c) => {
      const { token } = c.req.valid('json');
      const signedIn = await sessionUser(c);
      const inspected = await withScope(tokenScope(token, signedIn), (tx) =>
        inspectSignup(tx, token, c.var.clock.now()),
      );
      return c.json(inspected, 200);
    },
  )
  .post(
    '/verify',
    op({
      id: 'core.signup.verifySignup',
      stories: [StoryId.RG_02, StoryId.RG_04],
      description:
        '`{ token }` → `{ tenantId, possibleDuplicate }`; in one transaction creates the tenant org (onboarding, the tax id with its initial status, `possible_duplicate`), its `start` subscription, the verified user with the chosen password and the only `tenant_admin` membership, then signs in, replacing any session. Single use, 24 hours: a used, superseded or expired link answers 401. An account with the email answers 409 `conflict` with `reason: account_exists` and the registration stays pending. Service: `verifySignup` in `verify.redeem.ts`',
      responses: { 200: type<SignupVerified>() },
    }),
    validate(ValidationTarget.json, TokenBody),
    async (c) => {
      const { token } = c.req.valid('json');
      const signedIn = await sessionUser(c);
      const now = c.var.clock.now();
      const verified = await withScope(tokenScope(token, signedIn), async (tx) => {
        const result = await verifySignup(tx, token, now);
        await startSession(c, tx, result.userId, now);
        return result;
      });
      const body: SignupVerified = {
        tenantId: verified.tenantId,
        possibleDuplicate: verified.possibleDuplicate,
      };
      return c.json(body, 200);
    },
  );
