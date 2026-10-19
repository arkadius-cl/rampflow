import { defineAccountCases } from '../../../../test/route-cases.ts';
import { authTokenFor } from '../auth/fixtures.ts';
import { invitationFor } from './fixtures.ts';

export const accountCases = defineAccountCases([
  {
    method: 'POST',
    path: '/api/public/invitations/inspect',
    credential: 'token',
    singleUse: false,
    arrange: async (w, db) => {
      const inv = await invitationFor(db, {
        orgId: w.A.carrierId,
        orgKind: 'carrier',
        role: 'carrier_user',
        invitedBy: w.A.users.carrier_admin.id,
      });
      return {
        actor: null,
        body: { token: inv.token },
        otherToken: await authTokenFor(db, 'magic_link', w.A.users.carrier_user.id),
      };
    },
  },
  {
    method: 'POST',
    path: '/api/public/invitations/accept',
    credential: 'token',
    arrange: async (w, db) => {
      const inv = await invitationFor(db, {
        orgId: w.A.tenantId,
        orgKind: 'tenant',
        role: 'gate_operator',
        invitedBy: w.A.users.tenant_admin.id,
        siteIds: [w.A.sites[0].id],
      });
      return {
        actor: null,
        body: { token: inv.token, name: 'Gina Gate', password: 'gate password 2026' },
        otherToken: await authTokenFor(db, 'password_reset', w.A.users.gate_operator.id),
      };
    },
  },
]);
