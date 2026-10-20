import { AccountCredential, HttpMethod } from '@rampflow/shared/values';
import { defineAccountCases } from '../../../../test/route-cases.ts';
import { WORLD_NOW } from '../../../../test/world.ts';
import { signupEmail, signupForm, solvedAltcha } from './fixtures.ts';

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
]);
