import { randomUUID } from 'node:crypto';
import type { SignupBody } from '@rampflow/shared/modules/core/api.signup';
import { RateLimitBucket, SignupStatus } from '@rampflow/shared/modules/core/values';
import { EmailTemplate, ErrorCode, StaffLocale, TokenPurpose } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import { consumeRateLimit } from '../../../kernel/rate-limit.ts';
import { tokenHashFor } from '../../../kernel/tokens.ts';
import { accountByEmail } from '../auth/lookup.ts';
import { SIGNUP_TOKEN_MS, type SignupId, tenantSignup } from '../schema.signup.ts';

// RG-01 and RG-03: the registration request (design decision 5). Nothing but the pending row
// and one email is written; the answer never tells a known email from a new one.

async function withinLimit(
  bucket: typeof RateLimitBucket.signup_request | typeof RateLimitBucket.signup_ip,
  key: string,
  now: Date,
): Promise<boolean> {
  try {
    await consumeRateLimit(bucket, key, now);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.code === ErrorCode.rate_limited) return false;
    throw e;
  }
}

/**
 * 20 registrations per hour per client address and 3 per email. Over a limit the route still
 * answers 202 and writes nothing. Commits on its own connections, so call it outside any
 * transaction.
 */
export async function signupAllowed(email: string, ip: string, now: Date): Promise<boolean> {
  return (
    (await withinLimit(RateLimitBucket.signup_ip, ip, now)) &&
    (await withinLimit(RateLimitBucket.signup_request, email.toLowerCase(), now))
  );
}

/**
 * Under the anonymous scope. A known email gets the "you already have an account" email and no
 * row. A new one supersedes its pending registration and gets a new one with the verification
 * email. `passwordHash` is computed by the caller on both paths, so timing reveals nothing.
 */
export async function submitSignup(
  tx: Tx,
  input: { body: SignupBody; passwordHash: string; now: Date },
): Promise<void> {
  const { body, now } = input;
  const locale = body.locale ?? StaffLocale.en;
  if (await accountByEmail(tx, body.email)) {
    await enqueueEmail(
      tx,
      {
        template: EmailTemplate.core_signup_known_account,
        to: body.email,
        locale,
        tenantId: null,
        payload: { locale },
      },
      null,
    );
    return;
  }

  await tx
    .update(tenantSignup)
    .set({ status: SignupStatus.superseded })
    .where(
      and(eq(tenantSignup.email, body.email), eq(tenantSignup.status, SignupStatus.pending_email)),
    );
  const id = randomUUID() as SignupId;
  const inserted = await tx
    .insert(tenantSignup)
    .values({
      id,
      status: SignupStatus.pending_email,
      email: body.email,
      salutation: body.salutation,
      givenName: body.givenName,
      familyName: body.familyName,
      passwordHash: input.passwordHash,
      companyName: body.companyName,
      country: body.country,
      taxIdType: body.taxIdType,
      taxIdValue: body.taxIdValue,
      locale: body.locale ?? null,
      tokenHash: tokenHashFor(TokenPurpose.signup, id),
      expiresAt: new Date(now.getTime() + SIGNUP_TOKEN_MS),
    })
    // A concurrent registration of the same email won; its email went out.
    .onConflictDoNothing()
    .returning({ id: tenantSignup.id });
  if (inserted.length === 0) return;
  await enqueueEmail(
    tx,
    {
      template: EmailTemplate.core_signup_verify,
      to: body.email,
      locale,
      tenantId: null,
      payload: {
        signupId: id,
        companyName: body.companyName,
        salutation: body.salutation,
        givenName: body.givenName,
        familyName: body.familyName,
      },
    },
    null,
  );
}
