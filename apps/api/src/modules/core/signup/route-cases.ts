import { AuthTokenKind } from '@rampflow/shared/modules/core/values';
import { AccountCredential, HttpMethod } from '@rampflow/shared/values';
import type { OwnerDb } from '../../../../test/db.ts';
import { defineAccountCases } from '../../../../test/route-cases.ts';
import { WORLD_NOW } from '../../../../test/world.ts';
import { account, authTokenFor } from '../auth/fixtures.ts';
import { pendingSignup, signupEmail, signupForm, solvedAltcha } from './fixtures.ts';

/** A pending registration, and a magic-link token of another person the routes must refuse. */
async function tokenCase(db: OwnerDb) {
  const { token } = await pendingSignup(db, { now: WORLD_NOW });
  const other = await account(db);
  return {
    actor: null,
    body: { token },
    otherToken: await authTokenFor(db, AuthTokenKind.magic_link, other.id),
  };
}

export const accountCases = defineAccountCases([
  {
    method: HttpMethod.GET,
    path: '/api/public/signups/challenge',
    credential: AccountCredential.none,
    arrange: async () => ({ actor: null }),
  },
  {
    method: HttpMethod.POST,
    path: '/api/public/signups',
    credential: AccountCredential.none,
    arrange: async () => ({
      actor: null,
      body: { ...signupForm(signupEmail('route-case')), altcha: await solvedAltcha(WORLD_NOW) },
    }),
  },
  {
    method: HttpMethod.POST,
    path: '/api/public/signups/inspect',
    credential: AccountCredential.token,
    singleUse: false,
    arrange: (_w, db) => tokenCase(db),
  },
  {
    method: HttpMethod.POST,
    path: '/api/public/signups/verify',
    credential: AccountCredential.token,
    arrange: (_w, db) => tokenCase(db),
  },
]);
