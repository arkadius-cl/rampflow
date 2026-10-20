import { RegistrationStatus } from '@rampflow/shared/modules/booking/values';
import { AuthTokenKind } from '@rampflow/shared/modules/core/values';
import {
  AccountCredential,
  Feature,
  ForeignOutcome,
  HttpMethod,
  Permission,
  RouteCaseActor,
  RouteCaseGrant,
} from '@rampflow/shared/values';
import {
  defineAccountCases,
  defineRouteCases,
  type RouteCase,
} from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import { authTokenFor } from '../../core/auth/fixtures.ts';
import { carrierInvitationFor, registrationFor, unique } from './fixtures.ts';

const P = '/api/t/:orgId/carriers';

/** Rows the setup wrote in world A, by world. */
const fixtures = new WeakMap<World, { invitationId: string; registrationId: string }>();
const of = (w: World) => {
  const f = fixtures.get(w);
  if (!f) throw new Error('setup did not run');
  return f;
};

const base = {
  as: RouteCaseActor.dispatcher,
  permission: Permission.booking.manage_carriers,
  entitlement: null,
  foreign: ForeignOutcome.not_found,
  siteScoped: false,
  setup: async (w, db) => {
    const invitation = await carrierInvitationFor(db, {
      tenantId: w.A.tenantId,
      invitedBy: w.A.users.dispatcher.id,
    });
    const registration = await registrationFor(db, {
      tenantId: w.A.tenantId,
      siteId: w.A.sites[0].id,
      status: RegistrationStatus.pending_approval,
      carrierId: w.A.rivalCarrierId,
    });
    fixtures.set(w, { invitationId: invitation.id, registrationId: registration.id });
  },
} as const satisfies Partial<RouteCase>;

const org = (w: World) => ({ orgId: w.A.tenantId });

export const cases = defineRouteCases([
  { ...base, method: HttpMethod.GET, path: P, params: org, foreign: ForeignOutcome.empty },
  {
    ...base,
    method: HttpMethod.POST,
    path: `${P}/invitations`,
    entitlement: Feature.booking.carrier_portal,
    params: org,
    body: () => ({ companyName: 'Baltic Freight UAB', email: unique('case') }),
    foreign: ForeignOutcome.empty,
  },
  {
    ...base,
    method: HttpMethod.DELETE,
    path: `${P}/invitations/:invitationId`,
    params: (w) => ({ ...org(w), invitationId: of(w).invitationId }),
    // Deleting answers 204 even when nothing matched; B's revoke must leave A's invitation alone.
    foreign: ForeignOutcome.empty,
  },
  {
    ...base,
    method: HttpMethod.PATCH,
    path: `${P}/:carrierId`,
    params: (w) => ({ ...org(w), carrierId: w.A.carrierId }),
    body: () => ({ status: 'deactivated' }),
  },
  {
    ...base,
    method: HttpMethod.GET,
    path: `${P}/registrations`,
    entitlement: Feature.booking.public_link,
    params: org,
    foreign: ForeignOutcome.empty,
  },
  {
    ...base,
    method: HttpMethod.POST,
    path: `${P}/registrations/:registrationId/approve`,
    entitlement: Feature.booking.public_link,
    params: (w) => ({ ...org(w), registrationId: of(w).registrationId }),
  },
  {
    ...base,
    method: HttpMethod.POST,
    path: `${P}/registrations/:registrationId/reject`,
    entitlement: Feature.booking.public_link,
    params: (w) => ({ ...org(w), registrationId: of(w).registrationId }),
    body: () => ({ reason: 'No ADR approval' }),
  },
  {
    ...base,
    method: HttpMethod.GET,
    path: `${P}/public-links`,
    entitlement: Feature.booking.public_link,
    params: org,
    foreign: ForeignOutcome.empty,
  },
  {
    ...base,
    method: HttpMethod.POST,
    path: `${P}/public-links`,
    entitlement: Feature.booking.public_link,
    params: org,
    body: (w) => ({ siteId: w.A.sites[0].id }),
  },
  {
    ...base,
    method: HttpMethod.POST,
    path: `${P}/public-links/:siteId/regenerate`,
    entitlement: Feature.booking.public_link,
    params: (w) => ({ ...org(w), siteId: w.A.sites[0].id }),
  },
  {
    method: HttpMethod.GET,
    path: '/api/c/:orgId/tenants',
    as: RouteCaseActor.carrier_user,
    permission: RouteCaseGrant.member,
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId }),
    foreign: ForeignOutcome.empty,
    siteScoped: false,
  },
]);

export const accountCases = defineAccountCases([
  {
    method: HttpMethod.POST,
    path: '/api/public/carrier-invitations/inspect',
    credential: AccountCredential.token,
    singleUse: false,
    arrange: async (w, db) => {
      const inv = await carrierInvitationFor(db, {
        tenantId: w.A.tenantId,
        invitedBy: w.A.users.dispatcher.id,
      });
      return {
        actor: null,
        body: { token: inv.token },
        otherToken: await authTokenFor(db, AuthTokenKind.magic_link, w.A.users.carrier_admin.id),
      };
    },
  },
  {
    method: HttpMethod.POST,
    path: '/api/public/carrier-invitations/accept',
    credential: AccountCredential.token,
    arrange: async (w, db) => {
      const inv = await carrierInvitationFor(db, {
        tenantId: w.A.tenantId,
        invitedBy: w.A.users.dispatcher.id,
      });
      return {
        actor: null,
        body: { token: inv.token, name: 'Piotr Nowak', password: 'carrier password 2026' },
        otherToken: (await registrationFor(db, { tenantId: w.A.tenantId, siteId: w.A.sites[0].id }))
          .token,
      };
    },
  },
]);
