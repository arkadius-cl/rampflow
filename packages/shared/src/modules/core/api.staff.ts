import * as z from 'zod';
import { values } from '../../values/define.ts';
import { CarrierRole, SiteLimitedRole, TenantRole } from '../../values/roles.ts';

// Request schemas and response shapes of /api/t/:orgId/staff (TN-01) and /api/c/:orgId/users
// (CR-04). Both list members and pending invitations of one org.

export { CarrierRole, SiteLimitedRole, TenantRole };
export const TENANT_ROLES = values(TenantRole);
export const CARRIER_ROLES = values(CarrierRole);
export const SITE_LIMITED_ROLES = values(SiteLimitedRole);
export const isSiteLimited = (role: string) =>
  (values(SiteLimitedRole) as readonly string[]).includes(role);

const email = z.email().max(254);
const siteIds = z.array(z.uuid()).max(100);

const onlyOperatorsHaveSites = (v: { role?: TenantRole; siteIds?: string[] }) =>
  v.role === undefined || isSiteLimited(v.role) || !v.siteIds || v.siteIds.length === 0;
const sitesIssue = { message: 'Only gate and dock operators have a site list', path: ['siteIds'] };

export const InviteStaff = z
  .object({ email, role: z.enum(TenantRole), siteIds: siteIds.default([]) })
  .refine(onlyOperatorsHaveSites, sitesIssue);
export type InviteStaff = z.input<typeof InviteStaff>;

export const UpdateStaff = z
  .object({ role: z.enum(TenantRole), siteIds })
  .partial()
  .refine(onlyOperatorsHaveSites, sitesIssue);
export type UpdateStaff = z.infer<typeof UpdateStaff>;

export const InviteCarrierUser = z.object({ email, role: z.enum(CarrierRole) });
export type InviteCarrierUser = z.infer<typeof InviteCarrierUser>;

export const UpdateCarrierUser = z.object({ role: z.enum(CarrierRole) });
export type UpdateCarrierUser = z.infer<typeof UpdateCarrierUser>;

export interface MemberView<R extends string = string> {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: R;
  /** Gate and dock operators only; empty means every site. */
  siteIds: string[];
  /** The caller's own membership; the screens hide edit and remove on it. */
  self: boolean;
}

export interface InvitationView<R extends string = string> {
  id: string;
  email: string;
  role: R;
  siteIds: string[];
  expiresAt: string;
  /** Past `expiresAt`: it no longer works and no longer counts toward the user limit. */
  expired: boolean;
}

export interface MemberList<R extends string = string> {
  members: MemberView<R>[];
  invitations: InvitationView<R>[];
}

export type StaffList = MemberList<TenantRole>;
export type StaffMemberView = MemberView<TenantRole>;
export type StaffInvitationView = InvitationView<TenantRole>;
export type CarrierUserList = MemberList<CarrierRole>;
export type CarrierUserView = MemberView<CarrierRole>;
export type CarrierUserInvitationView = InvitationView<CarrierRole>;
