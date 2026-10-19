import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import type { MembershipId } from '../../../db/ids.ts';
import { invitationFor } from '../invitations/fixtures.ts';
import { inviteeEmail, membershipOf } from './fixtures.ts';

const P = '/api/t/:orgId/staff';

// Staff routes need core.manage_staff, which gate and dock operators lack, so `siteScoped`
// checks that an operator of the other site gets 403 (TN-01).
const base = {
  as: 'tenant_admin',
  permission: 'core.manage_staff',
  entitlement: null,
  foreign: 'not_found',
  siteScoped: true,
} as const satisfies Partial<RouteCase>;

const org = (w: World) => ({ orgId: w.A.tenantId });

const members = new WeakMap<World, MembershipId>();
const invitations = new WeakMap<World, string>();

export const cases = defineRouteCases([
  { ...base, method: 'GET', path: P, params: org, foreign: 'empty' },
  {
    ...base,
    method: 'POST',
    path: `${P}/invitations`,
    params: org,
    body: () => ({ email: inviteeEmail('staff'), role: 'dispatcher' }),
    foreign: 'empty',
  },
  {
    ...base,
    method: 'DELETE',
    path: `${P}/invitations/:invitationId`,
    setup: async (w, db) => {
      const inv = await invitationFor(db, {
        orgId: w.A.tenantId,
        orgKind: 'tenant',
        role: 'dispatcher',
        invitedBy: w.A.users.tenant_admin.id,
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
    setup: async (w, db) => {
      members.set(w, await membershipOf(db, w.A.users.dock_operator.id));
    },
    params: (w) => ({ ...org(w), membershipId: members.get(w) ?? '' }),
    body: () => ({ role: 'dispatcher' }),
  },
  {
    ...base,
    method: 'DELETE',
    path: `${P}/:membershipId`,
    setup: async (w, db) => {
      members.set(w, await membershipOf(db, w.A.users.dock_operator.id));
    },
    params: (w) => ({ ...org(w), membershipId: members.get(w) ?? '' }),
    foreign: 'empty',
  },
]);
