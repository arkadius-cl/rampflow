import { randomUUID } from 'node:crypto';
import type { SignupChallenge } from '@rampflow/shared/modules/core/api.signup';
import { EuCountry, SignupStatus, TaxIdType } from '@rampflow/shared/modules/core/values';
import { StaffLocale, TokenPurpose } from '@rampflow/shared/values';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import type { OwnerDb } from '../../../../test/db.ts';
import { deriveToken, tokenHashFor } from '../../../kernel/tokens.ts';
import { hashPassword } from '../auth/password.ts';
import { SIGNUP_TOKEN_MS, type SignupId, tenantSignup } from '../schema.signup.ts';
import { createSignupChallenge } from './altcha.ts';

// Test helpers for core/signup: a really solved ALTCHA challenge, and a pending registration.

/** The widget's payload for `challenge`: base64 JSON of the challenge and its solution. */
export async function solve(challenge: SignupChallenge): Promise<string> {
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error('ALTCHA challenge not solved');
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
}

/** A fresh challenge issued at `now`, solved. */
export async function solvedAltcha(now: Date): Promise<string> {
  return solve(await createSignupChallenge(now));
}

/** An address no account and no registration uses yet. */
export const signupEmail = (label = 'ops') => `${label}-${randomUUID()}@nordhafen.example`;

export const SIGNUP_PASSWORD = 'kuehlkette-2026';

/** The registration form of Jonas Petersen for Nordhafen, without the ALTCHA payload. */
export const signupForm = (email: string) => ({
  givenName: 'Jonas',
  familyName: 'Petersen',
  email,
  password: SIGNUP_PASSWORD,
  companyName: 'Nordhafen Kühllogistik GmbH',
  country: EuCountry.DE,
  taxIdType: TaxIdType.de_stn,
  taxIdValue: 'DE136695976-00001',
  locale: StaffLocale.de,
});

/** A `pending_email` registration created at `now`, and the token its email links to. */
export async function pendingSignup(
  db: OwnerDb,
  o: { now: Date; email?: string },
): Promise<{ id: SignupId; email: string; token: string }> {
  const id = randomUUID() as SignupId;
  const email = o.email ?? signupEmail();
  await db.insert(tenantSignup).values({
    id,
    status: SignupStatus.pending_email,
    email,
    salutation: null,
    givenName: 'Jonas',
    familyName: 'Petersen',
    passwordHash: await hashPassword(SIGNUP_PASSWORD),
    companyName: 'Nordhafen Kühllogistik GmbH',
    country: EuCountry.DE,
    taxIdType: TaxIdType.de_stn,
    taxIdValue: 'DE13669597600001',
    locale: StaffLocale.de,
    tokenHash: tokenHashFor(TokenPurpose.signup, id),
    expiresAt: new Date(o.now.getTime() + SIGNUP_TOKEN_MS),
  });
  return { id, email, token: deriveToken(TokenPurpose.signup, id) };
}
