import { randomUUID } from 'node:crypto';
import {
  EuCountry,
  Salutation,
  SignupStatus,
  TaxIdStatus,
  TaxIdType,
} from '@rampflow/shared/modules/core/values';
import { OrgKind, PackageId, Role, StaffLocale, TokenPurpose } from '@rampflow/shared/values';
import { and, eq, sql } from 'drizzle-orm';
import type { TenantId, UserId } from '../../src/db/ids.ts';
import { env } from '../../src/kernel/env.ts';
import { deriveToken, tokenHashFor } from '../../src/kernel/tokens.ts';
import { hashPassword } from '../../src/modules/core/auth/password.ts';
import {
  SIGNUP_TOKEN_MS,
  type SignupId,
  tenantSignup,
} from '../../src/modules/core/schema.signup.ts';
import { membership, org, tenantSubscription } from '../../src/modules/core/schema.ts';
import { findOrg, type SeedContext } from './context.ts';
import { ACME_VAT, DEMO_PASSWORD, type DemoAccount, ensureUser } from './core.ts';

// The self-registration demo data of design "Seed data" (02): three tenants in onboarding as a
// verified registration leaves them, and registrations waiting for their link. Every account
// uses DEMO_PASSWORD; docs/how-to/run-locally.md lists them.

interface SignupTenant {
  name: string;
  country: EuCountry;
  taxId: { type: TaxIdType; value: string; status: TaxIdStatus };
  possibleDuplicate: boolean;
  admin: DemoAccount;
}

export const SIGNUP_TENANTS: readonly SignupTenant[] = [
  {
    name: 'Nordhafen Kühllogistik GmbH',
    country: EuCountry.DE,
    taxId: { type: TaxIdType.de_stn, value: 'DE81190798000001', status: TaxIdStatus.unverified },
    possibleDuplicate: false,
    admin: {
      email: 'admin@nordhafen.local',
      name: 'Jonas Petersen',
      locale: StaffLocale.de,
      parts: { givenName: 'Jonas', familyName: 'Petersen', salutation: null },
    },
  },
  {
    name: 'Acme Logistik Süd GmbH',
    country: EuCountry.DE,
    // The VIES job is off in dev (VIES_URL empty), so the number stays pending.
    taxId: { type: TaxIdType.eu_vat, value: ACME_VAT, status: TaxIdStatus.pending },
    possibleDuplicate: true,
    admin: {
      email: 'admin@acme-sued.local',
      name: 'Lena Vogt',
      locale: StaffLocale.de,
      parts: { givenName: 'Lena', familyName: 'Vogt', salutation: Salutation.ms },
    },
  },
  {
    name: 'Wisła Magazyny Sp. z o.o.',
    country: EuCountry.PL,
    taxId: { type: TaxIdType.eu_vat, value: 'PL5260250274', status: TaxIdStatus.unavailable },
    possibleDuplicate: false,
    admin: {
      email: 'admin@wisla-magazyny.local',
      name: 'Piotr Zieliński',
      locale: StaffLocale.pl,
      parts: { givenName: 'Piotr', familyName: 'Zieliński', salutation: Salutation.mr },
    },
  },
];

export const WESER_EMAIL = 'kontakt@kuehlhaus-weser.local';
export const WESER_COMPANY = 'Kühlhaus Weser GmbH';
export const ELBE_EMAIL = 'info@lagerhaus-elbe.local';

const HOUR_MS = 60 * 60 * 1000;

interface SignupRow {
  email: string;
  status: typeof SignupStatus.pending_email | typeof SignupStatus.superseded;
  givenName: string;
  familyName: string;
  salutation: Salutation | null;
  companyName: string;
  country: EuCountry;
  taxId: { type: TaxIdType; value: string };
  locale: StaffLocale;
  /** Before the seed run. */
  createdAgoMs: number;
}

const weser = {
  email: WESER_EMAIL,
  givenName: 'Hauke',
  familyName: 'Brinkmann',
  salutation: Salutation.mr,
  companyName: WESER_COMPANY,
  country: EuCountry.DE,
  taxId: { type: TaxIdType.eu_vat, value: 'DE129273398' },
  locale: StaffLocale.de,
} as const;

export const SIGNUP_ROWS: readonly SignupRow[] = [
  { ...weser, status: SignupStatus.pending_email, createdAgoMs: 0 },
  { ...weser, status: SignupStatus.superseded, createdAgoMs: 2 * HOUR_MS },
  {
    email: ELBE_EMAIL,
    status: SignupStatus.pending_email,
    givenName: 'Marta',
    familyName: 'Schulz',
    salutation: Salutation.ms,
    companyName: 'Lagerhaus Elbe KG',
    country: EuCountry.DE,
    taxId: { type: TaxIdType.de_stn, value: '2475081508152' },
    locale: StaffLocale.de,
    // Its link expired 2 days before the run; retention deletes it 7 days after expiry.
    createdAgoMs: SIGNUP_TOKEN_MS + 48 * HOUR_MS,
  },
];

async function ensureTenant(ctx: SeedContext, t: SignupTenant): Promise<void> {
  const facts = {
    country: t.country,
    taxIdType: t.taxId.type,
    taxIdValue: t.taxId.value,
    taxIdStatus: t.taxId.status,
    taxIdCheckedAt: t.taxId.status === TaxIdStatus.unavailable ? sql`now()` : null,
    possibleDuplicate: t.possibleDuplicate,
  };
  let tenantId = (await findOrg(ctx.db, OrgKind.tenant, t.name)) as TenantId | null;
  if (tenantId) {
    await ctx.db.update(org).set(facts).where(eq(org.id, tenantId));
  } else {
    const [row] = await ctx.db
      .insert(org)
      .values({ kind: OrgKind.tenant, name: t.name, ...facts })
      .returning({ id: org.id });
    tenantId = row?.id as TenantId;
    ctx.log(`created tenant ${t.name}`);
  }
  const userId: UserId = await ensureUser(ctx, t.admin);
  await ctx.db
    .insert(tenantSubscription)
    .values({ tenantId, package: PackageId.start, updatedBy: userId })
    .onConflictDoNothing();
  await ctx.db
    .insert(membership)
    .values({ userId, orgId: tenantId, orgKind: OrgKind.tenant, role: Role.tenant_admin })
    .onConflictDoNothing();
}

/** Finds the row by email and status and resets its times, so its link works after each run. */
async function ensureSignup(ctx: SeedContext, r: SignupRow, now: Date): Promise<string> {
  const createdAt = new Date(now.getTime() - r.createdAgoMs);
  const times = {
    createdAt,
    expiresAt: new Date(createdAt.getTime() + SIGNUP_TOKEN_MS),
    passwordHash: await hashPassword(DEMO_PASSWORD),
  };
  const [found] = await ctx.db
    .update(tenantSignup)
    .set(times)
    .where(and(eq(tenantSignup.email, r.email), eq(tenantSignup.status, r.status)))
    .returning({ id: tenantSignup.id });
  if (found) return found.id;
  const id = randomUUID() as SignupId;
  await ctx.db.insert(tenantSignup).values({
    id,
    status: r.status,
    email: r.email,
    salutation: r.salutation,
    givenName: r.givenName,
    familyName: r.familyName,
    companyName: r.companyName,
    country: r.country,
    taxIdType: r.taxId.type,
    taxIdValue: r.taxId.value,
    locale: r.locale,
    tokenHash: tokenHashFor(TokenPurpose.signup, id),
    ...times,
  });
  ctx.log(`created ${r.status} registration of ${r.email}`);
  return id;
}

export async function seed(ctx: SeedContext): Promise<void> {
  for (const t of SIGNUP_TENANTS) await ensureTenant(ctx, t);
  const now = new Date();
  for (const r of SIGNUP_ROWS) {
    const id = await ensureSignup(ctx, r, now);
    if (r.email === WESER_EMAIL && r.status === SignupStatus.pending_email) {
      const link = `${env.APP_ORIGIN}/signup/verify#${deriveToken(TokenPurpose.signup, id)}`;
      ctx.log(`verification link of ${WESER_COMPANY}: ${link}`);
    }
  }
}
