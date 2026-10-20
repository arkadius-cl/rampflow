import { AccountCredential, HttpMethod, StaffLocale } from '@rampflow/shared/values';
import { defineAccountCases } from '../../../../test/route-cases.ts';

export const accountCases = defineAccountCases([
  {
    method: HttpMethod.GET,
    path: '/api/me',
    credential: AccountCredential.session,
    arrange: async (w) => ({ actor: w.A.users.gate_operator }),
  },
  {
    method: HttpMethod.PATCH,
    path: '/api/me',
    credential: AccountCredential.session,
    arrange: async (w) => ({ actor: w.A.users.carrier_user, body: { locale: StaffLocale.pl } }),
  },
]);
