import { CarrierLinkSource, CarrierLinkStatus } from '@rampflow/shared/modules/booking/values';
import type { UiPrefs } from '@rampflow/shared/modules/core/ui-prefs';
import { Salutation, TaxIdStatus, TaxIdType } from '@rampflow/shared/modules/core/values';
import { Module, OrgKind, Role, SeedOrg, StaffLocale } from '@rampflow/shared/values';
import { eq, sql } from 'drizzle-orm';
import type { AnyOrgId, CarrierId, TenantId, UserId } from '../../src/db/ids.ts';
import { hashPassword, verifyPassword } from '../../src/modules/core/auth/password.ts';
import {
  appUser,
  membership,
  org,
  tenantCarrierLink,
  tenantSubscription,
} from '../../src/modules/core/schema.ts';
import { findOrg, type SeedContext } from './context.ts';

// The demo orgs and accounts of docs/how-to/run-locally.md: the platform admin, the tenant
// Acme Logistics on the pro package with one user per tenant role, and the carrier
// Trans-Pol linked to Acme with its carrier admin. Every account uses DEMO_PASSWORD.
// The platform admin has two package groups open (PL-02), so the stored state shows at once.

export const DEMO_PASSWORD = 'rampflow-demo';
export const ACME = 'Acme Logistics';
/** Acme's VAT number, which the seeded "Acme Logistik Süd GmbH" shares (signups.ts). */
export const ACME_VAT = 'DE136695976';
export const TRANS_POL = 'Trans-Pol Sp. z o.o.';
export const ADMIN_UI_PREFS: UiPrefs = {
  'platform.packages.openModules': [Module.booking, Module.yard],
};

export interface DemoAccount {
  email: string;
  name: string;
  locale: StaffLocale;
  /** The name parts a registration records (person-names spec). */
  parts?: { givenName: string; familyName: string; salutation: Salutation | null };
}

interface DemoUser extends DemoAccount {
  org: SeedOrg;
  role: Role;
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    email: 'admin@rampflow.local',
    name: 'Sam Ops',
    locale: StaffLocale.en,
    org: SeedOrg.platform,
    role: Role.platform_admin,
  },
  {
    email: 'admin@acme.local',
    name: 'Anna Lenz',
    locale: StaffLocale.de,
    parts: { givenName: 'Anna', familyName: 'Lenz', salutation: Salutation.ms },
    org: SeedOrg.acme,
    role: Role.tenant_admin,
  },
  {
    email: 'dispatch@acme.local',
    name: 'Daniel Brandt',
    locale: StaffLocale.de,
    org: SeedOrg.acme,
    role: Role.dispatcher,
  },
  {
    email: 'gate@acme.local',
    name: 'Gerd Weber',
    locale: StaffLocale.de,
    org: SeedOrg.acme,
    role: Role.gate_operator,
  },
  {
    email: 'dock@acme.local',
    name: 'Dana Krüger',
    locale: StaffLocale.de,
    org: SeedOrg.acme,
    role: Role.dock_operator,
  },
  {
    email: 'admin@trans-pol.local',
    name: 'Piotr Nowak',
    locale: StaffLocale.pl,
    org: SeedOrg.transpol,
    role: Role.carrier_admin,
  },
];

const ORG_KIND = { platform: 'platform', acme: 'tenant', transpol: 'carrier' } as const;

async function ensureOrg(
  ctx: SeedContext,
  kind: OrgKind,
  name: string,
  country: string | null,
): Promise<AnyOrgId> {
  const found =
    kind === OrgKind.platform ? await platformOrg(ctx) : await findOrg(ctx.db, kind, name);
  if (found) return found;
  const [row] = await ctx.db.insert(org).values({ kind, name, country }).returning({ id: org.id });
  ctx.log(`created ${kind} ${name}`);
  return row?.id as AnyOrgId;
}

async function platformOrg(ctx: SeedContext): Promise<AnyOrgId | null> {
  const [row] = await ctx.db.select({ id: org.id }).from(org).where(eq(org.kind, 'platform'));
  return row?.id ?? null;
}

/** Creates or converges one account: verified, enabled, and signing in with DEMO_PASSWORD. */
export async function ensureUser(ctx: SeedContext, u: DemoAccount): Promise<UserId> {
  const [existing] = await ctx.db
    .select({ id: appUser.id, passwordHash: appUser.passwordHash })
    .from(appUser)
    .where(eq(appUser.email, u.email));
  const keep =
    existing?.passwordHash && (await verifyPassword(DEMO_PASSWORD, existing.passwordHash));
  const passwordHash = keep ? existing.passwordHash : await hashPassword(DEMO_PASSWORD);
  const [row] = await ctx.db
    .insert(appUser)
    .values({
      email: u.email,
      name: u.name,
      locale: u.locale,
      passwordHash,
      emailVerifiedAt: sql`now()`,
      ...u.parts,
    })
    .onConflictDoUpdate({
      target: appUser.email,
      set: {
        ...u.parts,
        passwordHash,
        disabledAt: null,
        emailVerifiedAt: sql`coalesce(${appUser.emailVerifiedAt}, now())`,
      },
    })
    .returning({ id: appUser.id });
  if (!existing) ctx.log(`created ${u.email}`);
  return row?.id as UserId;
}

export async function seed(ctx: SeedContext): Promise<void> {
  const orgs = {
    platform: await ensureOrg(ctx, OrgKind.platform, 'rampflow', null),
    acme: await ensureOrg(ctx, OrgKind.tenant, ACME, 'DE'),
    transpol: await ensureOrg(ctx, OrgKind.carrier, TRANS_POL, 'PL'),
  };
  const users = new Map<string, UserId>();
  for (const u of DEMO_USERS) {
    const id = await ensureUser(ctx, u);
    users.set(u.email, id);
    await ctx.db
      .insert(membership)
      .values({ userId: id, orgId: orgs[u.org], orgKind: ORG_KIND[u.org], role: u.role })
      .onConflictDoNothing();
  }
  await ctx.db
    .update(org)
    .set({
      taxIdType: TaxIdType.eu_vat,
      taxIdValue: ACME_VAT,
      taxIdStatus: TaxIdStatus.verified,
      taxIdCheckedAt: sql`coalesce(${org.taxIdCheckedAt}, now())`,
      activatedAt: sql`coalesce(${org.activatedAt}, ${org.createdAt})`,
    })
    .where(eq(org.id, orgs.acme));
  const admin = users.get('admin@rampflow.local') as UserId;
  // Merged per key like PATCH /api/me, so keys the admin set by hand stay.
  await ctx.db
    .update(appUser)
    .set({ uiPrefs: sql`${appUser.uiPrefs} || ${JSON.stringify(ADMIN_UI_PREFS)}::jsonb` })
    .where(eq(appUser.id, admin));
  await ctx.db
    .insert(tenantSubscription)
    .values({ tenantId: orgs.acme as TenantId, package: 'pro', updatedBy: admin })
    .onConflictDoUpdate({ target: tenantSubscription.tenantId, set: { package: 'pro' } });
  await ctx.db
    .insert(tenantCarrierLink)
    .values({
      tenantId: orgs.acme as TenantId,
      carrierId: orgs.transpol as CarrierId,
      status: CarrierLinkStatus.active,
      source: CarrierLinkSource.invitation,
    })
    .onConflictDoUpdate({
      target: [tenantCarrierLink.tenantId, tenantCarrierLink.carrierId],
      set: { status: CarrierLinkStatus.active, deactivatedAt: null },
    });
  ctx.log(`${DEMO_USERS.length} accounts ready`);
}
