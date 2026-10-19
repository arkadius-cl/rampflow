import * as z from 'zod';

// Request schemas and response shapes of /api/t/:orgId/staff (TN-01) and /api/c/:orgId/users
// (CR-04). Both list members and pending invitations of one org.

export const TENANT_ROLES = [
  'tenant_admin',
  'dispatcher',
  'gate_operator',
  'dock_operator',
] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const CARRIER_ROLES = ['carrier_admin', 'carrier_user'] as const;
export type CarrierRole = (typeof CARRIER_ROLES)[number];

/** Roles that may be limited to a site list. Without one they see every site. */
export const SITE_LIMITED_ROLES = [
  'gate_operator',
  'dock_operator',
] as const satisfies TenantRole[];
export const isSiteLimited = (role: string) =>
  (SITE_LIMITED_ROLES as readonly string[]).includes(role);

const email = z.email().max(254);
const siteIds = z.array(z.uuid()).max(100);

const onlyOperatorsHaveSites = (v: { role?: TenantRole; siteIds?: string[] }) =>
  v.role === undefined || isSiteLimited(v.role) || !v.siteIds || v.siteIds.length === 0;
const sitesIssue = { message: 'Only gate and dock operators have a site list', path: ['siteIds'] };

export const InviteStaff = z
  .object({ email, role: z.enum(TENANT_ROLES), siteIds: siteIds.default([]) })
  .refine(onlyOperatorsHaveSites, sitesIssue);
export type InviteStaff = z.input<typeof InviteStaff>;

export const UpdateStaff = z
  .object({ role: z.enum(TENANT_ROLES), siteIds })
  .partial()
  .refine(onlyOperatorsHaveSites, sitesIssue);
export type UpdateStaff = z.infer<typeof UpdateStaff>;

export const InviteCarrierUser = z.object({ email, role: z.enum(CARRIER_ROLES) });
export type InviteCarrierUser = z.infer<typeof InviteCarrierUser>;

export const UpdateCarrierUser = z.object({ role: z.enum(CARRIER_ROLES) });
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
export type CarrierUserList = MemberList<CarrierRole>;
