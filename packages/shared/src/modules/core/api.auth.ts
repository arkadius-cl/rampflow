import * as z from 'zod';
import { ROLES } from '../../contract/module.ts';
import { STAFF_LOCALES } from '../../locales.ts';

// Request and response bodies of /api/auth, /api/me and /api/public/invitations (U2).

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Length only, no composition rules (ADR-0003). */
export const Password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
export const Email = z.email().max(254);
/** A token from an emailed link: base64url of 32 bytes. */
export const EmailToken = z.string().min(20).max(100);
export const StaffLocale = z.enum(STAFF_LOCALES);

export const LoginBody = z.object({ email: Email, password: z.string().min(1).max(PASSWORD_MAX) });
export type LoginBody = z.infer<typeof LoginBody>;

/** Magic-link and reset requests. `locale` is the page's language, used for the email. */
export const EmailLinkBody = z.object({ email: Email, locale: StaffLocale.optional() });
export type EmailLinkBody = z.infer<typeof EmailLinkBody>;

export const TokenBody = z.object({ token: EmailToken });
export type TokenBody = z.infer<typeof TokenBody>;

/** The account a magic link signs in to, shown before the holder confirms (login CSRF). */
export interface MagicLinkInspect {
  email: string;
}

export const ResetConfirmBody = z.object({ token: EmailToken, password: Password });
export type ResetConfirmBody = z.infer<typeof ResetConfirmBody>;

export const OrgKind = z.enum(['platform', 'tenant', 'carrier']);
export type OrgKind = z.infer<typeof OrgKind>;

export const MeResponse = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    locale: StaffLocale.nullable(),
  }),
  memberships: z.array(
    z.object({ orgId: z.uuid(), orgKind: OrgKind, orgName: z.string(), role: z.enum(ROLES) }),
  ),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const MePatchBody = z
  .object({ name: z.string().trim().min(1).max(120), locale: StaffLocale })
  .partial();
export type MePatchBody = z.infer<typeof MePatchBody>;

export const InvitationInspectResponse = z.object({
  orgKind: OrgKind,
  orgName: z.string(),
  role: z.enum(ROLES),
  email: z.string(),
  /** An account with this email exists: the holder signs in, then accepts. */
  hasAccount: z.boolean(),
});
export type InvitationInspectResponse = z.infer<typeof InvitationInspectResponse>;

/** A new user sends `name` and `password`; a signed-in user with the invited email sends neither. */
export const InvitationAcceptBody = z.object({
  token: EmailToken,
  name: z.string().trim().min(1).max(120).optional(),
  password: Password.optional(),
  locale: StaffLocale.optional(),
});
export type InvitationAcceptBody = z.infer<typeof InvitationAcceptBody>;

export const InvitationAcceptResponse = z.object({ orgId: z.uuid(), orgKind: OrgKind });
export type InvitationAcceptResponse = z.infer<typeof InvitationAcceptResponse>;
