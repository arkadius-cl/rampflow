import * as z from 'zod';
import { StaffLocale } from '../../values/locales.ts';
import { Email, EmailToken, Password } from '../core/api.auth.ts';
import {
  type CarrierLinkSource,
  CarrierLinkStatus,
  type RegistrationMode,
  type RegistrationStatus,
} from './values.ts';

// Request schemas and response shapes of the carrier network (U7): /api/t/:orgId/carriers,
// /api/c/:orgId/tenants, /api/public/links, /api/public/registrations and
// /api/public/carrier-invitations (TN-03, TN-04, CR-01, CR-02).

const CompanyName = z.string().trim().min(1).max(120);
const PersonName = z.string().trim().min(1).max(120);
export const CountryCode = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, for example PL');
const Locale = z.enum(StaffLocale);

/** TN-03. `locale` is the language of the invitation email, default the inviter's. */
export const CarrierInvitationBody = z.object({
  companyName: CompanyName,
  email: Email,
  locale: Locale.optional(),
});
export type CarrierInvitationBody = z.infer<typeof CarrierInvitationBody>;

export const CarrierLinkPatch = z.object({ status: z.enum(CarrierLinkStatus) });
export type CarrierLinkPatch = z.infer<typeof CarrierLinkPatch>;

export const RejectRegistrationBody = z.object({ reason: z.string().trim().min(1).max(500) });
export type RejectRegistrationBody = z.infer<typeof RejectRegistrationBody>;

export const PublicLinkBody = z.object({ siteId: z.uuid() });
export type PublicLinkBody = z.infer<typeof PublicLinkBody>;

/** CR-02. `locale` is the page's language; the carrier's emails use it. */
export const RegistrationBody = z.object({
  companyName: CompanyName,
  country: CountryCode,
  contactName: PersonName,
  email: Email,
  locale: Locale.optional(),
});
export type RegistrationBody = z.infer<typeof RegistrationBody>;

/**
 * CR-01. A signed-in user with the invited email just accepts. A new user sends `name` and
 * `password`, and may rename the company.
 */
export const CarrierInvitationAcceptBody = z.object({
  token: EmailToken,
  name: PersonName.optional(),
  password: Password.optional(),
  companyName: CompanyName.optional(),
  locale: Locale.optional(),
});
export type CarrierInvitationAcceptBody = z.infer<typeof CarrierInvitationAcceptBody>;

export interface CarrierLinkView {
  carrierId: string;
  name: string;
  country: string | null;
  status: CarrierLinkStatus;
  source: CarrierLinkSource;
  linkedAt: string;
  deactivatedAt: string | null;
}

export interface CarrierInvitationView {
  id: string;
  companyName: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

/** GET /api/t/:orgId/carriers. */
export interface CarrierNetwork {
  links: CarrierLinkView[];
  invitations: CarrierInvitationView[];
}

export interface RegistrationView {
  id: string;
  siteId: string;
  siteName: string;
  /** The company name the registrant typed. */
  companyName: string;
  /** The carrier org that verification bound, which the link connects; null before verification. */
  carrierName: string | null;
  country: string;
  contactName: string;
  email: string;
  status: RegistrationStatus;
  rejectReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface PublicLinkView {
  siteId: string;
  siteName: string;
  /** `null` until the admin creates the link. */
  slug: string | null;
  /** `booking.public_link_enabled` of the site: the only on and off switch. */
  enabled: boolean;
  mode: RegistrationMode;
}

/** GET /api/public/links/:slug: what the registration page shows. */
export interface PublicLinkInfo {
  tenantName: string;
  siteName: string;
  city: string;
  country: string;
  /** The tenant's logo while `brand.logo` is on (TN-05). */
  logoUrl: string | null;
}

export interface CarrierInvitationInspect {
  tenantName: string;
  /** The tenant's logo while `brand.logo` is on (TN-05). */
  logoUrl: string | null;
  companyName: string;
  email: string;
  /** An account with this email exists: the holder signs in, then accepts. */
  hasAccount: boolean;
}

export interface CarrierInvitationAccepted {
  carrierId: string;
}

export interface RegistrationVerified {
  carrierId: string;
  status: typeof RegistrationStatus.approved | typeof RegistrationStatus.pending_approval;
}

/** GET /api/c/:orgId/tenants: a tenant the carrier is linked to or registered at. */
export interface LinkedTenant {
  tenantId: string;
  name: string;
  link: { status: CarrierLinkStatus; since: string; deactivatedAt: string | null } | null;
  /** The newest registration at this tenant, if any. */
  registration: {
    status: RegistrationStatus;
    rejectReason: string | null;
    createdAt: string;
  } | null;
}
