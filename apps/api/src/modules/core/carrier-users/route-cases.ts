import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import type { MembershipId } from '../../../db/ids.ts';
import { invitationFor } from '../invitations/fixtures.ts';
import { inviteeEmail, membershipOf } from '../staff/fixtures.ts';

const P = '/api/c/:orgId/users';

const base = {
  as: 'carrier_admin',
  permission: 'core.manage_carrier_users',
  entitlement: null,
  foreign: 'not_found',
  siteScoped: false,
} as const satisfies Partial<RouteCase>;

const org = (w: World) => ({ orgId: w.A.carrierId });

const members = new WeakMap<World, MembershipId>();
const invitations = new WeakMap<World, string>();
const colleague = async (w: World, db: Parameters<NonNullable<RouteCase['setup']>>[1]) => {
  members.set(w, await membershipOf(db, w.A.users.carrier_user.id));
};

export const cases = defineRouteCases([
  { ...base, method: 'GET', path: P, params: org, foreign: 'empty' },
  {
    ...base,
    method: 'POST',
    path: `${P}/invitations`,
    params: org,
    body: () => ({ email: inviteeEmail('colleague'), role: 'carrier_user' }),
    foreign: 'empty',
  },
  {
    ...base,
    method: 'DELETE',
    path: `${P}/invitations/:invitationId`,
    setup: async (w, db) => {
      const inv = await invitationFor(db, {
        orgId: w.A.carrierId,
        orgKind: 'carrier',
        role: 'carrier_user',
        invitedBy: w.A.users.carrier_admin.id,
      });
      invitations.set(w, inv.id);
    },
    params: (w) => ({ ...org(w), invitationId: invitations.get(w) ?? '' }),
    foreign: 'empty',
  },
  {
    ...base,
    method: 'PATCH',
    path: `${P}/:membershipId`,
    setup: colleague,
    params: (w) => ({ ...org(w), membershipId: members.get(w) ?? '' }),
    body: () => ({ role: 'carrier_admin' }),
  },
  {
    ...base,
    method: 'DELETE',
    path: `${P}/:membershipId`,
    setup: colleague,
    params: (w) => ({ ...org(w), membershipId: members.get(w) ?? '' }),
    foreign: 'empty',
  },
]);
