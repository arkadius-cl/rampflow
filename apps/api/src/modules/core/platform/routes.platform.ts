import {
  CreateTenant,
  InviteTenantAdmin,
  NewTenantNote,
  type OverrideView,
  type PackageList,
  type PlatformMemberList,
  PlatformMemberListQuery,
  type PlatformSiteList,
  PlatformSiteListQuery,
  PutOverride,
  SuspensionBody,
  type TenantDetail,
  type TenantList,
  TenantListQuery,
  type TenantNoteList,
  TenantNoteListQuery,
  type TenantNoteView,
  UpdateTenant,
} from '@rampflow/shared/modules/core/api.platform';
import {
  PatchPlatformSettings,
  PutPlatformSetting,
  type SettingEntry,
  type SettingsView,
} from '@rampflow/shared/modules/core/api.settings';
import type { InvitationView } from '@rampflow/shared/modules/core/api.staff';
import {
  Permission,
  ScopeParty,
  Setting,
  SettingScope,
  StoryId,
  ValidationTarget,
} from '@rampflow/shared/values';
import type { Context } from 'hono';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema, type TenantId } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import { noBody, op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
import { resetSetting, settingsView, writeSetting, writeSettings } from '../settings/settings.ts';
import { invitationView } from '../staff/invitations.ts';
import { memberList } from './members.ts';
import { createNote, listNotes } from './notes.ts';
import { reactivateTenant, suspendTenant } from './suspension.ts';
import { siteList } from './tenant-reads.ts';
import {
  createTenant,
  deleteOverride,
  inviteTenantAdmin,
  listTenants,
  packageList,
  putOverride,
  requireTenant,
  tenantDetail,
  updateTenant,
} from './tenants.ts';

const TenantParam = z.object({ tenantId: idSchema<'tenant'>() });
const OverrideParam = TenantParam.extend({ key: z.string().min(1).max(100) });
const KeyParam = z.object({ key: z.string().min(1).max(100) });

const PLATFORM = { scope: SettingScope.platform } as const;

function platformUser(c: Context<AppEnv>) {
  const { scope } = c.var;
  if (scope.party !== ScopeParty.platform)
    throw new Error(`platform route under party ${scope.party}`);
  return scope.userId;
}

/** The language of emails the platform sends: the platform default locale. */
const platformLocale = async (c: Context<AppEnv>) =>
  (await c.var.access.setting(Setting.i18n.default_locale, null)).value;

const tenants = requirePermission(Permission.core.manage_tenants);
const settings = requirePermission(Permission.core.manage_platform_settings);

/** Mounted at `/api/platform` by modules/index.ts (PL-01 to PL-04). */
export const platform = new Hono<AppEnv>()
  .get(
    '/tenants',
    op({
      id: 'core.platform.listTenants',
      stories: [StoryId.PL_01, StoryId.PL_04],
      description:
        "One page of tenants in a view: `{ items: [{ id, name, package, createdAt, status, country, taxId, admin, lastActivityAt, possibleDuplicate, usage }], total, page, pageSize, facets: { status, package, country, flag }, views: { attention, all } }`. `status` is `suspended` while `suspended_at` is set, else `onboarding` without an activation time, else `active`. `country` is the ISO code or `null`; `taxId` is `{ type, value, status }` as stored, or `null`; `admin` is `{ email, invited }`: the earliest `tenant_admin` member, else the newest open admin invitation with `invited: true`, else `null`; `lastActivityAt` is the latest `last_seen_at` of the tenant's members, `null` when nobody signed in. Query (all optional): `view` is `attention` (default: onboarding, suspended, possible duplicate or tax id `unverified`) or `all`; `q` searches the name, the tax id (spaces, dots, dashes and slashes ignored) and the emails of admin members and open admin invitations, case-insensitively as a substring; the facets take comma-separated values: `status`, `package`, `country` (EU-27 codes and `none` for no country) and `flag` (`possible_duplicate`, `tax_id_unverified`, OR-ed); `duplicateOf` (a tenant id) keeps that tenant and every tenant the registration's duplicate rule matches against it (equivalent tax id or a shared non-free-mail member email domain), an id that is not a tenant matches nothing; `sort` is `name` (default), `status`, `package` (both in their set order), `country`, `createdAt` or `lastActivityAt` (no country and never active last in both directions), `order` is `asc` (default) or `desc` with `id` as tiebreaker, `page` from 1 (default) to 10000, `pageSize` 10, 25 (default), 50 or 100; anything else is 422 at its path. `total` counts the page's view under `q`, `duplicateOf` and every facet; `facets.<name>` counts per value within the view under the other filters, ignoring its own selection; `views` counts each view under `q`, `duplicateOf` and the facets. A page past the end has no items. `usage` holds one meter `{ used, limit, soft, over }` per limit, counted for the page rows only: `core.max_sites` (active sites), `core.max_docks` (active and maintenance docks), `core.max_internal_users` (members plus invitations that still work) and `booking.max_bookings_per_month` (bookings created since the first of the UTC month). `over` is `used > limit` and blocks nothing. Counted in the request transaction as the tenant with actor `system:usage`",
      responses: { 200: type<TenantList>() },
    }),
    tenants,
    validate(ValidationTarget.query, TenantListQuery.query),
    async (c) => c.json(await listTenants(c.var.db, c.req.valid('query'), c.var.clock.now()), 200),
  )
  .post(
    '/tenants',
    op({
      id: 'core.platform.createTenant',
      stories: [StoryId.PL_01],
      description:
        '`{ name, package, adminEmail }` → 201 tenant detail. Creates org (status `onboarding`), subscription and a `tenant_admin` invitation, and enqueues `core.invitation` in the platform default locale. Service: `createTenant` in `core/platform/tenants.ts`',
      responses: { 201: type<TenantDetail>() },
    }),
    tenants,
    validate(ValidationTarget.json, CreateTenant),
    async (c) => {
      const now = c.var.clock.now();
      const id = await createTenant(
        c.var.db,
        { ...c.req.valid('json'), createdBy: platformUser(c), locale: await platformLocale(c) },
        now,
      );
      return c.json(await tenantDetail(c.var.db, id, now), 201);
    },
  )
  .get(
    '/tenants/:tenantId',
    op({
      id: 'core.platform.getTenant',
      stories: [StoryId.PL_02, StoryId.PL_06],
      description:
        "The list row's fields plus `{ activatedAt, taxId: { type, value, status, checkedAt } | null, suspension: { at, reason, by: { id, name } | null } | null, admins: [{ id, name, email }], onboarding: { status, activatedAt, steps } | null, entitlements: [{ key, module, kind, soft, value, source, packageValue? }], overrides: [{ key, value, expiresAt, note, active }], adminInvitations: [{ id, email, expiresAt }] }`. `suspension` is the latest suspension note while the tenant is suspended; `admins` are the `tenant_admin` members by membership time; `onboarding` is the tenant's checklist (ON-01) while it is onboarding, read as the tenant with actor `system:platform_read`. Reserved keys are left out; 404 for an id that is not a tenant",
      responses: { 200: type<TenantDetail>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    async (c) => {
      const { tenantId } = c.req.valid('param');
      return c.json(await tenantDetail(c.var.db, tenantId as TenantId, c.var.clock.now()), 200);
    },
  )
  .patch(
    '/tenants/:tenantId',
    op({
      id: 'core.platform.updateTenant',
      stories: [StoryId.PL_02, StoryId.PL_06],
      description:
        '`{ name?, package?, country? }` → tenant detail. `country` is an EU-27 code or `null` to clear it (422 at `["country"]` otherwise). With a stored tax id, a country the tax id does not fit, or `null`, answers 409 `conflict` with reason `tax_id_country` and changes nothing; the tax id and its check status never change here',
      responses: { 200: type<TenantDetail>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    validate(ValidationTarget.json, UpdateTenant),
    async (c) => {
      const tenantId = c.req.valid('param').tenantId as TenantId;
      const now = c.var.clock.now();
      await updateTenant(c.var.db, tenantId, c.req.valid('json'), platformUser(c), now);
      return c.json(await tenantDetail(c.var.db, tenantId, now), 200);
    },
  )
  // PL-06 tenant hub lists (members and sites).
  .get(
    '/tenants/:tenantId/members',
    op({
      id: 'core.platform.listTenantMembers',
      stories: [StoryId.PL_06],
      description:
        "One page of the tenant's members and open invitations: `{ items, total, page, pageSize, facets: { role, state } }`. A member row is `{ kind: 'member', id (membership), userId, name, email, role, state: 'member' | 'disabled', emailVerified, lastActivityAt, since }`, an invitation row `{ kind: 'invitation', id, name: null, email, role, state: 'invited' | 'expired', emailVerified: false, lastActivityAt: null, since, expiresAt }`; accepted and revoked invitations are left out. Query (all optional): `q` searches name and email, `role` (tenant roles) and `state` take comma-separated values, `sort` is `name` (default), `email`, `role`, `lastActivityAt` or `since` (no name and never active last in both directions), `order`, `page` and `pageSize` as for the tenant list. `facets.role` and `facets.state` count under the search and the other facet. 404 for an id that is not a tenant",
      responses: { 200: type<PlatformMemberList>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    validate(ValidationTarget.query, PlatformMemberListQuery.query),
    async (c) => {
      const tenantId = c.req.valid('param').tenantId as TenantId;
      await requireTenant(c.var.db, tenantId);
      const now = c.var.clock.now();
      return c.json(await memberList(c.var.db, tenantId, c.req.valid('query'), now), 200);
    },
  )
  .get(
    '/tenants/:tenantId/sites',
    op({
      id: 'core.platform.listTenantSites',
      stories: [StoryId.PL_06],
      description:
        "One page of the tenant's sites, master data only: `{ items: [{ id, name, city, country, timeZone, active, halls, docks, createdAt }], total, page, pageSize, facets: { active: { yes, no } } }`. `docks` counts active and maintenance docks. Query (all optional): `q` searches name and city, `active` takes `yes`, `no` or both, `sort` is `name` (default), `city` or `createdAt`, `order`, `page` and `pageSize` as for the tenant list. Read in the request transaction as the tenant with actor `system:platform_read`. 404 for an id that is not a tenant",
      responses: { 200: type<PlatformSiteList>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    validate(ValidationTarget.query, PlatformSiteListQuery.query),
    async (c) => {
      const tenantId = c.req.valid('param').tenantId as TenantId;
      await requireTenant(c.var.db, tenantId);
      return c.json(await siteList(c.var.db, tenantId, c.req.valid('query')), 200);
    },
  )
  // End of the PL-06 tenant hub lists.
  .put(
    '/tenants/:tenantId/overrides/:key',
    op({
      id: 'core.platform.putOverride',
      stories: [StoryId.PL_02],
      description:
        '`{ value, expiresAt?, note? }`, `value` a boolean, a non-negative integer or `null` (unlimited) → the override. 400 `bad_request` with `reason` `unknown_key` or `reserved_key`, then 422 on `["value"]` for a value of the wrong kind. Applies from the tenant\'s next request',
      responses: { 200: type<OverrideView>() },
    }),
    tenants,
    validate(ValidationTarget.param, OverrideParam),
    validate(ValidationTarget.json, PutOverride),
    async (c) => {
      const { tenantId, key } = c.req.valid('param');
      const view = await putOverride(
        c.var.db,
        tenantId as TenantId,
        key,
        c.req.valid('json'),
        platformUser(c),
        c.var.clock.now(),
      );
      return c.json(view, 200);
    },
  )
  .delete(
    '/tenants/:tenantId/overrides/:key',
    op({
      id: 'core.platform.deleteOverride',
      stories: [StoryId.PL_02],
      description: '204',
      responses: { 204: noBody },
    }),
    tenants,
    validate(ValidationTarget.param, OverrideParam),
    async (c) => {
      const { tenantId, key } = c.req.valid('param');
      await deleteOverride(c.var.db, tenantId as TenantId, key);
      return c.body(null, 204);
    },
  )
  .post(
    '/tenants/:tenantId/invitations',
    op({
      id: 'core.platform.createAdminInvitation',
      stories: [StoryId.PL_01],
      description:
        '`{ email }` → 201 invitation; re-invites a tenant admin. A pending invitation to the same email is revoked and replaced',
      responses: { 201: type<InvitationView>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    validate(ValidationTarget.json, InviteTenantAdmin),
    async (c) => {
      const now = c.var.clock.now();
      const row = await inviteTenantAdmin(
        c.var.db,
        c.req.valid('param').tenantId as TenantId,
        c.req.valid('json').email,
        platformUser(c),
        await platformLocale(c),
        now,
      );
      return c.json(invitationView(row, now), 201);
    },
  )
  // Suspension and notes (PL-07, PL-08).
  .post(
    '/tenants/:tenantId/suspend',
    op({
      id: 'core.platform.suspendTenant',
      stories: [StoryId.PL_07],
      description:
        "`{ reason }` (1 to 500 characters after trimming) → tenant detail with status `suspended`. Sets the suspension time, writes a `suspended` note with the reason and enqueues `core.tenant-suspended` to every `tenant_admin` member who is not disabled, in their locale or the platform default. From the next request on, the tenant's staff and carriers at it get 403 `tenant_suspended`, its drivers 401 and its public links 404 (ADR-0018). A suspended tenant stays as it is (200, no note, no email); 404 for an id that is not a tenant",
      responses: { 200: type<TenantDetail>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    validate(ValidationTarget.json, SuspensionBody),
    async (c) => {
      const tenantId = c.req.valid('param').tenantId as TenantId;
      const now = c.var.clock.now();
      const input = {
        reason: c.req.valid('json').reason,
        userId: platformUser(c),
        locale: await platformLocale(c),
      };
      await suspendTenant(c.var.db, tenantId, input, now);
      return c.json(await tenantDetail(c.var.db, tenantId, now), 200);
    },
  )
  .post(
    '/tenants/:tenantId/reactivate',
    op({
      id: 'core.platform.reactivateTenant',
      stories: [StoryId.PL_07],
      description:
        '`{ reason }` (1 to 500 characters after trimming) → tenant detail with status `onboarding` or `active`. Clears the suspension time, writes a `reactivated` note and enqueues `core.tenant-reactivated` to every `tenant_admin` member who is not disabled. A tenant that is not suspended stays as it is (200, no note, no email); 404 for an id that is not a tenant',
      responses: { 200: type<TenantDetail>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    validate(ValidationTarget.json, SuspensionBody),
    async (c) => {
      const tenantId = c.req.valid('param').tenantId as TenantId;
      const now = c.var.clock.now();
      const input = {
        reason: c.req.valid('json').reason,
        userId: platformUser(c),
        locale: await platformLocale(c),
      };
      await reactivateTenant(c.var.db, tenantId, input, now);
      return c.json(await tenantDetail(c.var.db, tenantId, now), 200);
    },
  )
  .get(
    '/tenants/:tenantId/notes',
    op({
      id: 'core.platform.listTenantNotes',
      stories: [StoryId.PL_08],
      description:
        "One page of the tenant's notes: `{ items: [{ id, kind, body, author: { id, name } | null, createdAt }], total, page, pageSize, facets: { kind: { note, suspended, reactivated } } }`. `author` is `null` once the account is deleted. Query (all optional): `q` searches the body as a case-insensitive substring, `kind` filters by a comma-separated list of kinds, `sort` is `createdAt`, `order` is `desc` (default) or `asc` with `id` as tiebreaker, `page` and `pageSize` as in the tenant list. `facets.kind` counts per kind the notes matching `q`, ignoring `kind`. 404 for an id that is not a tenant",
      responses: { 200: type<TenantNoteList>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    validate(ValidationTarget.query, TenantNoteListQuery.query),
    async (c) => {
      const tenantId = c.req.valid('param').tenantId as TenantId;
      return c.json(await listNotes(c.var.db, tenantId, c.req.valid('query')), 200);
    },
  )
  .post(
    '/tenants/:tenantId/notes',
    op({
      id: 'core.platform.createTenantNote',
      stories: [StoryId.PL_08],
      description:
        '`{ body }` (1 to 2,000 characters after trimming) → 201 note of kind `note` with the author. Notes cannot be changed or deleted; suspension notes come from the suspend and reactivate commands. 404 for an id that is not a tenant',
      responses: { 201: type<TenantNoteView>() },
    }),
    tenants,
    validate(ValidationTarget.param, TenantParam),
    validate(ValidationTarget.json, NewTenantNote),
    async (c) => {
      const note = await createNote(
        c.var.db,
        c.req.valid('param').tenantId as TenantId,
        c.req.valid('json').body,
        platformUser(c),
        c.var.clock.now(),
      );
      return c.json(note, 201);
    },
  )
  .get(
    '/packages',
    op({
      id: 'core.platform.listPackages',
      stories: [StoryId.PL_02],
      description: '`{ items: [{ id, values: [{ key, module, kind, soft, value }] }] }`, read-only',
      responses: { 200: type<PackageList>() },
    }),
    tenants,
    (c) => c.json(packageList(), 200),
  )
  .get(
    '/settings',
    op({
      id: 'core.platform.listSettings',
      stories: [StoryId.PL_03],
      description:
        "`{ scope: 'platform', siteId: null, items }`: every key with platform scope, shaped as in the tenant settings read",
      responses: { 200: type<SettingsView>() },
    }),
    settings,
    async (c) => c.json(await settingsView(c.var.db, PLATFORM, null), 200),
  )
  .patch(
    '/settings',
    op({
      id: 'core.platform.patchSettings',
      stories: [StoryId.PL_03],
      description:
        'A topic form\'s save: `{ set: { <key>: value }, reset: [<key>] }` → the platform settings view. All or nothing. At least one entry and no key in both lists (422). 400 for an unknown key or one without platform scope, 422 under `["set", key, ...]`. Tenant and site rows stay',
      responses: { 200: type<SettingsView>() },
    }),
    settings,
    validate(ValidationTarget.json, PatchPlatformSettings),
    async (c) => {
      const view = await writeSettings(
        c.var.db,
        PLATFORM,
        null,
        c.req.valid('json'),
        platformUser(c),
        c.var.clock.now(),
      );
      return c.json(view, 200);
    },
  )
  .put(
    '/settings/:key',
    op({
      id: 'core.platform.putSetting',
      stories: [StoryId.PL_03],
      description:
        '`{ value }` → the field. 400 for an unknown key or one without platform scope; 422 with the zod path under `["value", ...]`. Tenant and site rows stay',
      responses: { 200: type<SettingEntry>() },
    }),
    settings,
    validate(ValidationTarget.param, KeyParam),
    validate(ValidationTarget.json, PutPlatformSetting),
    async (c) => {
      const entry = await writeSetting(
        c.var.db,
        PLATFORM,
        null,
        { key: c.req.valid('param').key, value: c.req.valid('json').value },
        platformUser(c),
        c.var.clock.now(),
      );
      return c.json(entry, 200);
    },
  )
  .delete(
    '/settings/:key',
    op({
      id: 'core.platform.deleteSetting',
      stories: [StoryId.PL_03],
      description: '204; back to the code default',
      responses: { 204: noBody },
    }),
    settings,
    validate(ValidationTarget.param, KeyParam),
    async (c) => {
      await resetSetting(c.var.db, PLATFORM, c.req.valid('param').key);
      return c.body(null, 204);
    },
  );
