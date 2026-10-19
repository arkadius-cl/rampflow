import { defineAccountCases } from '../../../../test/route-cases.ts';

export const accountCases = defineAccountCases([
  {
    method: 'GET',
    path: '/api/me',
    credential: 'session',
    arrange: async (w) => ({ actor: w.A.users.gate_operator }),
  },
  {
    method: 'PATCH',
    path: '/api/me',
    credential: 'session',
    arrange: async (w) => ({ actor: w.A.users.carrier_user, body: { locale: 'pl' } }),
  },
]);
