import {
  CARRIER_ROLES,
  type CarrierRole,
  InviteCarrierUser,
  UpdateCarrierUser,
} from '@rampflow/shared/modules/core/api.staff';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { guard } from '@/lib/access';
import { api, call } from '@/lib/api';
import { type MembersAdmin, MembersScreen } from '@/modules/core/members';
import { carrierUsersKey, carrierUsersQuery } from '@/modules/core/queries';

// CR-04: a carrier admin invites colleagues, changes their role and removes them.

export const Route = createFileRoute('/c/$orgId/users/')({
  beforeLoad: guard({ permission: 'core.manage_carrier_users' }),
  component: CarrierUsersPage,
});

function CarrierUsersPage() {
  const { t } = useTranslation();
  const { orgId } = Route.useParams();
  const queryClient = useQueryClient();
  const list = useQuery(carrierUsersQuery(orgId));
  const refresh = () => queryClient.invalidateQueries({ queryKey: carrierUsersKey(orgId) });
  const users = api.c[':orgId'].users;
  const admin: MembersAdmin<CarrierRole> = {
    roles: CARRIER_ROLES,
    list: list.data,
    inviteSchema: InviteCarrierUser,
    updateSchema: UpdateCarrierUser,
    invite: async ({ email, role }) => {
      await call(users.invitations.$post({ param: { orgId }, json: { email, role } }));
      await refresh();
    },
    update: async (membershipId, { role }) => {
      await call(users[':membershipId'].$patch({ param: { orgId, membershipId }, json: { role } }));
      await refresh();
    },
    remove: async (membershipId) => {
      await call(users[':membershipId'].$delete({ param: { orgId, membershipId } }));
      await refresh();
    },
    revoke: async (invitationId) => {
      await call(users.invitations[':invitationId'].$delete({ param: { orgId, invitationId } }));
      await refresh();
    },
  };
  return (
    <MembersScreen
      title={t(($) => $.staff.colleagues_title)}
      description={t(($) => $.staff.colleagues_description)}
      admin={admin}
    />
  );
}
