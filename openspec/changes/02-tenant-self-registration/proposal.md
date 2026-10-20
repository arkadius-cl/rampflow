# Proposal

## Why

Today a tenant exists only when a platform admin creates it (PL-01) and invites its first admin; ADR-0003 says "there is no sign-up endpoint" for companies. The product owner decided that warehouse operators register themselves (shared brief, decision 4): a person enters salutation, first and last name, email, password, company name and tax id, confirms the email, and becomes `tenant_admin` of a new tenant on the free `start` package. Changes 03 (onboarding) and 04 (platform tenant views) build on the tenant status and the registration data this change introduces, and 05 (Stripe) later hands the tax id to Stripe.

## What Changes

- **Public registration page `/signup`** with the fields of decision 4 plus the company's country (EU-27) and the page language. Salutation is optional with "no answer" as default, and is used only for the email greeting.
- **Registration API under `/api/public/signups`**: a proof-of-work challenge, the registration itself (always 202), an inspect call and the verification call for the emailed link. Every route gets an account case.
- **Abuse protection without manual approval**: ALTCHA proof-of-work (self-hosted, no cookies, verified by our API), rate limits `signup_request` (3 per hour per email) and `signup_ip` (20 per hour per client address) that answer the same 202 and write nothing, a single-use check for each solved challenge, and a 422 for disposable email domains (CC0 list `disposable-email-domains`).
- **Pending registration row `tenant_signup`** with a hashed single-use 24-hour token. Nothing else is written before the link is used. A new registration for the same email supersedes the pending one. A known email gets a "you already have an account" email instead, and no row is written.
- **Verification**: `/signup/verify#<token>` shows the email and company and asks for one click (login CSRF, as for magic links). The click claims the row in one guarded statement and in the same transaction creates the tenant org, the user (with given name, family name and salutation; `name` stays the display name), the `tenant_admin` membership and the `start` subscription. It signs the new user in and lands on the tenant home, which 03 turns into the onboarding checklist.
- **Duplicate hint**: when another tenant has the same tax id (equivalent forms included) or a member with the same company email domain (free-mail domains excluded), the verify page says "your company may already use rampflow, ask its admin to invite you". Creation stays allowed, and the new tenant is flagged `possible_duplicate` for the platform admin.
- **Tax id**: a required pair (type, value) with types `eu_vat`, `de_stn` (tax number or W-IdNr) and `pl_nip`. Format, country and check digit are checked synchronously in the shared schema, so the form and the API agree. For `eu_vat`, a new job checks the number against VIES in the background and stores `pending`, `verified`, `unverified` or `unavailable`. A VIES outage never blocks registration.
- **Tenant status** derived from the new `org.activated_at`: `null` is `onboarding`, a value is `active`. Existing tenants are backfilled with their `created_at`. Tenants created by a platform admin (PL-01) also start in onboarding. 03 writes the activation; 04 adds `suspended`. The platform tenant list shows the status and filters by it.
- **Retention**: the retention job deletes every `tenant_signup` row 7 days after its link expired. Where it anonymizes a user, it also clears the given name, family name and salutation. The stored password hash leaves the row when the link is used.
- **ADR-0016** records self-registration, ALTCHA, the tax id checks, the VIES job and the new RLS rights for the `token` party. ADR-0003's "no sign-up endpoint" is amended.
- New stories RG-01 to RG-05 in `docs/explanation/mvp-scope.md`; PL-01 and PL-05 are amended.

No breaking API change: every route is new, and `TenantSummary` gains a field.

## Capabilities

### New Capabilities

- `tenant-self-registration`: the public registration form and request: fields, validation, abuse protection, the generic answer, the known-email path, the emails and the lifetime of pending registrations.
- `tenant-signup-verification`: the emailed link: inspect, the single-use claim, what it creates, sign-in and landing, the duplicate hint and flag, and the failure cases.
- `tax-id-validation`: tax id types, normalization, synchronous format and check-digit rules, and the asynchronous VIES status for EU VAT numbers.
- `tenant-lifecycle`: the derived tenant status (`onboarding`, `active`), its start for self-registered and admin-created tenants, and the backfill of existing tenants. 03 adds activation, 04 adds suspension.
- `person-names`: given name, family name and optional salutation of a user, the email greeting built from them, and their anonymization.

### Modified Capabilities

None in `openspec/specs/`. This change also adds a requirement to `platform-tenant-list`, which change 01 introduces (status column and status filter). Its delta is written as ADDED and applies once 01 is archived.

## Impact

- **Code:**
  - API: new `apps/api/src/modules/core/signup/` (`routes.public.ts`, `route-cases.ts`, `signups.ts`, `verify.redeem.ts`, `duplicates.redeem.ts`, `altcha.ts`, `disposable-domains.ts` with the vendored list, `free-mail-domains.ts`, `fixtures.ts`, `signup.test.ts`), new `core/schema.signup.ts` (`tenant_signup`), new job `core/jobs/tax-id-check.ts` with a VIES client, new emails `core/emails/signup-verify.tsx` and `core/emails/signup-known-account.tsx` and a greeting helper; `core/schema.ts` (org and `app_user` columns, `token` policies on `org` and `tenant_subscription`, rate-limit buckets), `kernel/rate-limit.ts`, `kernel/tokens.ts` (purpose `TokenPurpose.signup`), `kernel/env.ts` (`VIES_URL`), `kernel/system.ts` (`platformSystemScope`), `core/platform/tenants.ts` (status in the summary, PL-01 starts in onboarding), `privacy/jobs/retention.ts`, `db/rls.test.ts`, `test/model.ts`, `scripts/openapi/sections.ts`. Coordinator files: `apps/api/src/modules/index.ts` (mount `/api/public/signups`), `biome.json` (restricted import of `tenant_signup`), `.env.example` (`VIES_URL=`).
  - Shared: new `packages/shared/src/modules/core/api.signup.ts`, `tax-id.ts` (+ tests), `tenant-status.ts`; `api.platform.ts` (`TenantSummary.status`, status facet); value sets per ADR-0019 in `packages/shared/src/modules/core/values.ts` (`TenantStatus`, `SignupStatus`, `Salutation`, `TaxIdType`, `TaxIdStatus`, `TaxIdCheck`, `SignupIssue`, `EuCountry`, `ViesError`) and new members of `ConflictReason`, `TokenPurpose`, `RateLimitBucket`, `SystemActorName`, `JobName`, `EmailTemplate` and `StoryId` in `packages/shared/src/values/`.
  - Web: new `apps/web/src/routes/signup/index.tsx`, `signup/verify.tsx`, `apps/web/src/modules/core/signup-form.tsx`, `altcha-field.tsx`; `routes/login.tsx` (link to registration); `components/app-shell/form-errors.ts` (new issue codes); `routes/platform/tenants/index.tsx` (status column and filter).
  - Dependencies, exact pins: `altcha-lib` (API), `altcha` widget (web), `jsvat` (shared). The disposable domain list is vendored as a file (CC0), not installed.
  - i18n: new part `packages/i18n/locales/{de,en,pl}/core/signup.json`; `core/errors.json` (conflict reason `account_exists`), `core/auth.json` (validation messages, login link), `core/platform.json` (status labels).
  - Tests: `signup.test.ts`, `tax-id.test.ts`, `tax-id-check.test.ts`, `retention.test.ts`, `platform.test.ts`, `emails.test.ts`, route cases; e2e `e2e/core/RG-01.spec.ts` to `RG-05.spec.ts`, `PL-01.spec.ts` (new tenant shows "Onboarding"), `PL-04.spec.ts` (status filter).
- **API:** new routes `GET /api/public/signups/challenge`, `POST /api/public/signups`, `POST /api/public/signups/inspect`, `POST /api/public/signups/verify`; new 409 reason `account_exists`; `GET /api/platform/tenants` items gain `status` and the list a `status` facet.
- **External system:** the VIES REST API of the European Commission (`check-vat-number`), called only by the job.
- **Data model:** yes. New table `tenant_signup`. New `org` columns `tax_id_type`, `tax_id_value`, `tax_id_status`, `tax_id_checked_at`, `possible_duplicate`, `activated_at`, with checks that tie them to `kind = 'tenant'`. New `app_user` columns `given_name`, `family_name`, `salutation`. New rate-limit buckets `signup_request`, `signup_ip`, `altcha_solution`. One generated migration `pnpm db:generate --name 02-tenant-self-registration`, plus the backfill of `activated_at`, which the coordinator lands as custom SQL (ADR-0001, point 8). Seed: `apps/api/scripts/seed/core.ts` (Acme's tax id and admin names) and a new `apps/api/scripts/seed/signups.ts` (self-registered tenants in each state, pending, expired and superseded registrations).
- **Docs:**
  - `docs/decisions/ADR-0016-tenant-self-registration.md` (new).
  - `docs/decisions/ADR-0003-authentication-self-built-sessions.md`: sign-up paths, abuse limits, token purpose `signup`.
  - `docs/decisions/ADR-0002-tenancy-isolation-rls.md`: the `token` party may insert onboarding tenant orgs and `start` subscriptions; `tenant_signup` has no RLS.
  - `docs/decisions/ADR-0010-email-outbox-job-runner.md`: the `tax_id_check` job and the new account emails.
  - `docs/decisions/ADR-0011-frontend-routes-and-org-context.md`: route map rows for `/signup` and `/signup/verify`.
  - `docs/reference/data-model.md`: `tenant_signup`, the `org` and `app_user` columns, the buckets, the retention rules, the ER diagram.
  - `docs/reference/api-routes.md`: the new conflict reason and prose for the registration routes (the tables regenerate).
  - `docs/explanation/mvp-scope.md`: stories RG-01 to RG-05, PL-01 and PL-05 amendments, the security line on public sign-up, a resolved question.
  - `docs/explanation/domain-glossary.md`: registration, tenant status, tax id.
  - `docs/explanation/research/domain-standards.md` is not touched here (03 corrects §2).
  - `docs/how-to/register-your-company.md` (new): register, confirm the email, what happens next.
  - `docs/how-to/onboard-a-tenant.md`: tenants also register themselves; a new tenant starts in onboarding.
  - `docs/how-to/run-locally.md`: the new demo accounts, `VIES_URL`, the printed link of the pending demo registration.
  - `AGENTS.md`: none, its conventions still hold.
