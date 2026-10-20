import { HttpMethod } from '@rampflow/shared/values';
import { defineAccountCases } from '../../../../test/route-cases.ts';
import {
  carrierInvitationFor,
  openLinkFor,
  registrationFor,
  unique,
} from '../carriers/fixtures.ts';

export const accountCases = defineAccountCases([
  {
    method: HttpMethod.GET,
    path: '/api/public/links/:slug',
    credential: 'none',
    arrange: async (w, db) => {
      const slug = await openLinkFor(db, {
        tenantId: w.A.tenantId,
        siteId: w.A.sites[0].id,
        by: w.A.users.tenant_admin.id,
      });
      return { actor: null, params: { slug } };
    },
  },
  {
    method: HttpMethod.POST,
    path: '/api/public/links/:slug/registrations',
    credential: 'none',
    arrange: async (w, db) => {
      const slug = await openLinkFor(db, {
        tenantId: w.A.tenantId,
        siteId: w.A.sites[0].id,
        by: w.A.users.tenant_admin.id,
      });
      return {
        actor: null,
        params: { slug },
        body: {
          companyName: 'Baltic Freight UAB',
          country: 'LT',
          contactName: 'Rasa Jankauskiene',
          email: unique('register'),
        },
      };
    },
  },
  {
    method: HttpMethod.POST,
    path: '/api/public/registrations/verify',
    credential: 'token',
    arrange: async (w, db) => {
      const target = { tenantId: w.A.tenantId, siteId: w.A.sites[0].id };
      await openLinkFor(db, { ...target, by: w.A.users.tenant_admin.id });
      const registration = await registrationFor(db, target);
      const invitation = await carrierInvitationFor(db, {
        tenantId: w.A.tenantId,
        invitedBy: w.A.users.dispatcher.id,
        email: registration.email,
      });
      return { actor: null, body: { token: registration.token }, otherToken: invitation.token };
    },
  },
]);
