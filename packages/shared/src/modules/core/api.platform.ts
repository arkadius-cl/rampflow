import * as z from 'zod';
import type { EntitlementSource } from '../../contract/entitlements.ts';
import { defineList, type ListPage } from '../../contract/list.ts';
import type { Limit } from '../../contract/module.ts';
import type { ModuleId } from '../../registry.ts';
import type { EntitlementKind } from '../../values/entitlements.ts';
import { SortOrder } from '../../values/list.ts';
import { PackageId } from '../../values/packages.ts';
import { TenantRole } from '../../values/roles.ts';
import { YesNo } from '../../values/ui.ts';
import type { OnboardingView } from './api.onboarding.ts';
import {
  EuCountry,
  type PlatformMemberKind,
  PlatformMemberSortKey,
  PlatformMemberState,
  PlatformSiteSortKey,
  type TaxIdStatus,
  type TaxIdType,
  TenantCountryFacet,
  TenantFlag,
  TenantListView,
  TenantNoteKind,
  TenantNoteSortKey,
  TenantSortKey,
  TenantStatus,
  type UsageKey,
} from './values.ts';

// Request schemas and response shapes of /api/platform (PL-01 to PL-08).

const name = z.string().trim().min(1).max(120);

export const CreateTenant = z.object({
  name,
  package: z.enum(PackageId),
  adminEmail: z.email().max(254),
});
export type CreateTenant = z.infer<typeof CreateTenant>;

/**
 * `country` is the tenant's legal seat (PL-06): one of the EU-27, or `null` to clear it. With a
 * stored tax id it must fit that id, else 409 `conflict` with reason `tax_id_country`.
 */
export const UpdateTenant = z
  .object({ name, package: z.enum(PackageId), country: z.enum(EuCountry).nullable() })
  .partial();
export type UpdateTenant = z.infer<typeof UpdateTenant>;

/** `POST /tenants/:tenantId/suspend` and `/reactivate` (PL-07): the reason goes into a note. */
export const SuspensionBody = z.object({ reason: z.string().trim().min(1).max(500) });
export type SuspensionBody = z.infer<typeof SuspensionBody>;

/** `POST /tenants/:tenantId/notes` (PL-08). */
export const NewTenantNote = z.object({ body: z.string().trim().min(1).max(2000) });
export type NewTenantNote = z.infer<typeof NewTenantNote>;

export const InviteTenantAdmin = z.object({ email: z.email().max(254) });
export type InviteTenantAdmin = z.infer<typeof InviteTenantAdmin>;

/**
 * `PUT /tenants/:tenantId/overrides/:key`. The value's kind is checked against the key after the
 * key itself (400 for unknown or reserved keys, then 422 on `value`).
 */
export const PutOverride = z.object({
  value: z.union([z.boolean(), z.int().min(0), z.null()]),
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
});
export type PutOverride = z.infer<typeof PutOverride>;

export type { UsageKey };

export interface UsageMeter {
  used: number;
  /** `null` is unlimited. */
  limit: Limit;
  /** A soft limit only flags usage; a hard limit blocks the next write at `limit`. */
  soft: boolean;
  /** `used > limit`. Blocks nothing by itself. */
  over: boolean;
}

export type TenantUsage = Record<UsageKey, UsageMeter>;

export interface TenantTaxId {
  type: TaxIdType;
  /** As stored: normalized, without spaces or separators. */
  value: string;
  status: TaxIdStatus;
}

export interface TenantSummary {
  id: string;
  name: string;
  package: PackageId;
  /** ISO instant the tenant org was created. */
  createdAt: string;
  /** Derived from the suspension and activation times (`tenantStatus`). */
  status: TenantStatus;
  /** ISO 3166-1 alpha-2, the registered or corrected legal seat; `null` when not set. */
  country: string | null;
  taxId: TenantTaxId | null;
  /** The earliest `tenant_admin` member, else the newest open admin invitation (`invited`). */
  admin: { email: string; invited: boolean } | null;
  /** The latest `app_user.last_seen_at` of the tenant's members; `null` when nobody signed in. */
  lastActivityAt: string | null;
  possibleDuplicate: boolean;
  usage: TenantUsage;
}

/**
 * `GET /tenants` (PL-04): search by name, tax id and admin email, filter by status, package,
 * country and flags, sort by the main columns, within a view. `view` defaults to `attention`
 * for the API and the URL. `duplicateOf` narrows the list to a tenant and its possible
 * duplicates (PL-06).
 */
export const TenantListQuery = defineList({
  sort: TenantSortKey,
  defaultSort: TenantSortKey.name,
  defaultOrder: SortOrder.asc,
  facets: {
    status: TenantStatus,
    package: PackageId,
    country: TenantCountryFacet,
    flag: TenantFlag,
  },
  params: {
    view: z.enum(TenantListView).default(TenantListView.attention),
    duplicateOf: z.uuid().optional(),
  },
});

export interface TenantList extends ListPage<TenantSummary> {
  /**
   * Per facet value, the tenants that match the search, the view and the other facets' filters,
   * ignoring the facet's own selection.
   */
  facets: {
    status: Record<TenantStatus, number>;
    package: Record<PackageId, number>;
    country: Record<TenantCountryFacet, number>;
    flag: Record<TenantFlag, number>;
  };
  /** Per view, the tenants that match the search, the facets and `duplicateOf`. */
  views: Record<TenantListView, number>;
}

export interface EntitlementView {
  key: string;
  module: ModuleId;
  kind: EntitlementKind;
  soft: boolean;
  value: boolean | Limit;
  source: EntitlementSource;
  /** What the tenant's package grants, `undefined` when the package omits the key (off). */
  packageValue?: boolean | Limit;
}

export interface OverrideView {
  key: string;
  value: boolean | Limit;
  expiresAt: string | null;
  note: string | null;
  /** `false` once `expiresAt` has passed: the row stays but no longer applies. */
  active: boolean;
}

export interface PendingInvitationView {
  id: string;
  email: string;
  expiresAt: string;
}

export interface TenantSuspension {
  /** ISO instant of the suspension. */
  at: string;
  reason: string;
  /** The platform admin who suspended; `null` once that account is deleted. */
  by: { id: string; name: string } | null;
}

export interface TenantAdminView {
  id: string;
  name: string;
  email: string;
}

export interface TenantDetail extends TenantSummary {
  /** ISO instant of the first dock; `null` while onboarding. */
  activatedAt: string | null;
  taxId: (TenantTaxId & { checkedAt: string | null }) | null;
  /** The latest suspension, from the notes; `null` unless the status is `suspended`. */
  suspension: TenantSuspension | null;
  /** Every `tenant_admin` member, by membership time. */
  admins: TenantAdminView[];
  /** 03's checklist, only while the status is `onboarding`. */
  onboarding: OnboardingView | null;
  /** Every implemented key, in catalog order. */
  entitlements: EntitlementView[];
  overrides: OverrideView[];
  adminInvitations: PendingInvitationView[];
}

/** `GET /tenants/:tenantId/members` (PL-06): members and open invitations in one table. */
export const PlatformMemberListQuery = defineList({
  sort: PlatformMemberSortKey,
  defaultSort: PlatformMemberSortKey.name,
  defaultOrder: SortOrder.asc,
  facets: { role: TenantRole, state: PlatformMemberState },
});

export interface PlatformMemberRow {
  kind: typeof PlatformMemberKind.member;
  /** The membership id. */
  id: string;
  userId: string;
  name: string;
  email: string;
  role: TenantRole;
  state: typeof PlatformMemberState.member | typeof PlatformMemberState.disabled;
  emailVerified: boolean;
  lastActivityAt: string | null;
  /** ISO instant the membership was created. */
  since: string;
}

export interface PlatformInvitationRow {
  kind: typeof PlatformMemberKind.invitation;
  /** The invitation id. */
  id: string;
  name: null;
  email: string;
  role: TenantRole;
  state: typeof PlatformMemberState.invited | typeof PlatformMemberState.expired;
  emailVerified: false;
  lastActivityAt: null;
  /** ISO instant the invitation was sent. */
  since: string;
  expiresAt: string;
}

export type PlatformMemberView = PlatformMemberRow | PlatformInvitationRow;

export interface PlatformMemberList extends ListPage<PlatformMemberView> {
  facets: { role: Record<TenantRole, number>; state: Record<PlatformMemberState, number> };
}

/** `GET /tenants/:tenantId/sites` (PL-06): master data only, no operational data. */
export const PlatformSiteListQuery = defineList({
  sort: PlatformSiteSortKey,
  defaultSort: PlatformSiteSortKey.name,
  defaultOrder: SortOrder.asc,
  facets: { active: YesNo },
});

export interface PlatformSiteView {
  id: string;
  name: string;
  city: string;
  country: string;
  timeZone: string;
  active: boolean;
  halls: number;
  /** Active and maintenance docks, as `core.max_docks` counts. */
  docks: number;
  createdAt: string;
}

export interface PlatformSiteList extends ListPage<PlatformSiteView> {
  facets: { active: Record<YesNo, number> };
}

/** `GET /tenants/:tenantId/notes` (PL-08): newest first. */
export const TenantNoteListQuery = defineList({
  sort: TenantNoteSortKey,
  defaultSort: TenantNoteSortKey.createdAt,
  defaultOrder: SortOrder.desc,
  facets: { kind: TenantNoteKind },
});

export interface TenantNoteView {
  id: string;
  kind: TenantNoteKind;
  body: string;
  /** `null` once the author's account is deleted. */
  author: { id: string; name: string } | null;
  createdAt: string;
}

export interface TenantNoteList extends ListPage<TenantNoteView> {
  facets: { kind: Record<TenantNoteKind, number> };
}

export interface PackageView {
  id: PackageId;
  values: {
    key: string;
    module: ModuleId;
    kind: EntitlementKind;
    soft: boolean;
    value: boolean | Limit;
  }[];
}

export interface PackageList {
  items: PackageView[];
}
