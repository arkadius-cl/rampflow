import { defineAccountCases, defineRouteCases } from '../../../../test/route-cases.ts';

export const cases = defineRouteCases([
  {
    method: 'DELETE',
    path: '/api/driver/session',
    as: 'driver',
    permission: 'driver',
    entitlement: null,
    params: () => ({}),
    foreign: 'empty',
    siteScoped: false,
  },
]);

// The exchange takes a driver token, which the harness's `token` credential treats as a wrong
// party, so it runs as an open route; session.test.ts covers unknown, expired and revoked tokens.
export const accountCases = defineAccountCases([
  {
    method: 'POST',
    path: '/api/public/driver-session',
    credential: 'none',
    arrange: async (w) => ({ actor: null, body: { token: w.A.bookings.own.driverToken } }),
  },
]);
