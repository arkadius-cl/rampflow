import {
  AccountCredential,
  ForeignOutcome,
  HttpMethod,
  RouteCaseActor,
  RouteCaseGrant,
} from '@rampflow/shared/values';
import { defineAccountCases, defineRouteCases } from '../../../../test/route-cases.ts';

export const cases = defineRouteCases([
  {
    method: HttpMethod.DELETE,
    path: '/api/driver/session',
    as: RouteCaseActor.driver,
    permission: RouteCaseGrant.driver,
    entitlement: null,
    params: () => ({}),
    foreign: ForeignOutcome.empty,
    siteScoped: false,
  },
]);

// The exchange takes a driver token, which the harness's `token` credential treats as a wrong
// party, so it runs as an open route; session.test.ts covers unknown, expired and revoked tokens.
export const accountCases = defineAccountCases([
  {
    method: HttpMethod.POST,
    path: '/api/public/driver-session',
    credential: AccountCredential.none,
    arrange: async (w) => ({ actor: null, body: { token: w.A.bookings.own.driverToken } }),
  },
]);
