import { randomBytes, randomUUID } from 'node:crypto';
import type { OwnerDb } from '../../../../test/db.ts';
import { hashToken, type Id, type UserId } from '../../../db/ids.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { appUser, authToken } from '../schema.ts';
import { hashPassword } from './password.ts';
import type { AuthTokenKind } from './tokens.ts';

// Test fixtures for accounts and emailed auth tokens, written as the owner.

export const FIXTURE_PASSWORD = 'correct horse battery';
let fixtureHash: Promise<string> | undefined;

export interface Account {
  id: UserId;
  email: string;
  password: string;
}

export async function account(
  db: OwnerDb,
  o: { verified?: boolean; disabled?: boolean; email?: string } = {},
): Promise<Account> {
  fixtureHash ??= hashPassword(FIXTURE_PASSWORD);
  const id = randomUUID() as UserId;
  const email = o.email ?? `user-${randomBytes(4).toString('hex')}@auth.test`;
  await db.insert(appUser).values({
    id,
    email,
    name: 'Ada Account',
    locale: 'en',
    passwordHash: await fixtureHash,
    emailVerifiedAt: o.verified === false ? null : new Date(),
    disabledAt: o.disabled ? new Date() : null,
  });
  return { id, email, password: FIXTURE_PASSWORD };
}

/** An unused token of `kind` for `userId`; returns the raw token the email would carry. */
export async function authTokenFor(
  db: OwnerDb,
  kind: AuthTokenKind,
  userId: UserId,
  expiresAt: Date = new Date(Date.now() + 10 * 60_000),
): Promise<string> {
  const id = randomUUID() as Id<'auth_token'>;
  const token = deriveToken(kind, id);
  await db.insert(authToken).values({ id, kind, userId, tokenHash: hashToken(token), expiresAt });
  return token;
}
