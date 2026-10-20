import { InviteStaff, UpdateStaff } from '@rampflow/shared/modules/core/api.staff';
import { Permission, TenantRole, values } from '@rampflow/shared/values';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { guard, tenantContextQuery } from '@/lib/access';
import { api, call } from '@/lib/api';
import { type MembersAdmin, MembersScreen } from '@/modules/core/members';
import { staffKey, staffQuery } from '@/modules/core/queries';

// TN-01: staff with role and sites, and pending invitations.

export const Route = createFileRoute('/t/$orgId/staff/')({
  beforeLoad: guard({ permission: Permission.core.manage_staff }),
  component: StaffPage,
});

function StaffPage() {
  const { t } = useTranslation();
  const { orgId } = Route.useParams();
  const queryClient = useQueryClient();
  const list = useQuery(staffQuery(orgId));
  const sites = useQuery(tenantContextQuery(orgId)).data?.sites ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: staffKey(orgId) });
  const staff = api.t[':orgId'].staff;
  const admin: MembersAdmin<TenantRole> = {
    roles: values(TenantRole),
    sites,
    list: list.data,
    inviteSchema: InviteStaff,
    updateSchema: UpdateStaff,
    invite: async (json) => {
      await call(staff.invitations.$post({ param: { orgId }, json }));
      await refresh();
    },
    update: async (membershipId, json) => {
      await call(staff[':membershipId'].$patch({ param: { orgId, membershipId }, json }));
      await refresh();
    },
    remove: async (membershipId) => {
      await call(staff[':membershipId'].$delete({ param: { orgId, membershipId } }));
      await refresh();
    },
    revoke: async (invitationId) => {
      await call(staff.invitations[':invitationId'].$delete({ param: { orgId, invitationId } }));
      await refresh();
    },
  };
  return (
    <MembersScreen
      title={t(($) => $.staff.title)}
      description={t(($) => $.staff.description)}
      admin={admin}
    />
  );
}
