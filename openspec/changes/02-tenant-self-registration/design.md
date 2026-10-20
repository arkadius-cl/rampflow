# Design

## Context

- **Identity today** ([ADR-0003](../../../docs/decisions/ADR-0003-authentication-self-built-sessions.md)): users come into existence only by invitation acceptance and by public-link carrier registration (CR-02). Emailed tokens are `HMAC(TOKEN_SECRET, "<purpose>:<row id>")` (`kernel/tokens.ts`), stored as `sha256`, sent in the URL fragment and claimed by one guarded `update ... where token_hash = $h and <still pending> returning`. Every redemption runs in one transaction under `tokenScope(token, signedIn)` and switches scope with `asScope` only for writes the token party cannot do (`booking/carriers/carrier-org.redeem.ts`); Biome allows `asScope` and `systemActor` only in jobs and `*.redeem.ts`.
- **The CR-02 precedent** (`booking/registration/`): `registrationAllowed` consumes `registration_ip` and `registration_request` on their own connections and answers 202 without writing when over a limit; `submitRegistration` sends a "known account" variant of the email instead of revealing the account; `verifyRegistration` creates the user with `email_verified_at` and the route calls `startSession`. Invitation acceptance (`core/invitations/accept.redeem.ts`) also signs in. Neither page asks before exchanging; the magic-link page does ("Continue as", login CSRF).
- **Tenant creation today** is `createTenant` in `core/platform/tenants.ts` under the platform party: `org` (kind `tenant`), `tenant_subscription` and a `tenant_admin` invitation. RLS on `org` lets `user` and `token` insert only `kind = 'carrier'`; `tenant_subscription` is written only by `platform`; `membership` is writable by the `tenant` party for its own org.
- **Parties**: the `public` party needs a tenant id (a public link), so a request with no tenant yet runs as `anonymous`, which may call `app.user_by_email()` and enqueue tenant-less outbox rows. Tables without RLS (`session`, `auth_token`, `rate_limit_event`, `job_run`, `public_link`) are reachable only from their owning directory through Biome's restricted imports and are listed in `WITHOUT_RLS` in `db/rls.test.ts`.
- **Retention** (`privacy/jobs/retention.ts`) is set-based and idempotent, deletes auth rows after 24 hours, and anonymizes carrier users that a foreign key still references, under a platform scope with the nil user id.
- **Jobs** are discovered from `modules/<module>/jobs/<name>.ts`; `JobContext` carries `tx`, `clock` and `mailer`. No API code calls an external HTTP service yet.
- **Migrations** are generated from the Drizzle schema; custom SQL is landed by the coordinator on `main` (ADR-0001, point 8).
- Change 01 introduces the list query contract and the `platform-tenant-list` capability; 03 writes `org.activated_at` on activation and gates onboarding; 04 builds the platform tenant views and adds `suspended`.

## Goals / Non-Goals

**Goals:**
- A self-service path from the public form to a signed-in `tenant_admin` of a new `start` tenant, safe to leave open without manual approval.
- The tenant status and the registration data (tax id, its check status, duplicate flag, person names) that 03, 04 and 05 read.
- Data minimization: nothing but one short-lived row before the email is confirmed, and no password hash kept after it.

**Non-Goals:**
- Joining an existing tenant from a registration ("join requests"), or creating a second org from an existing account. The hint tells the person to ask for an invitation.
- Editing the tax id, the names or the salutation after registration (no profile form in this change), and showing tax id, tax id status or the duplicate flag in platform screens (04).
- Onboarding gating, the checklist and the activation write (03). Suspension (04). Stripe customers and paid packages (05).
- Non-EU companies (open question), manual approval, and a registry check for `de_stn` and `pl_nip`.

## Decisions

### 1. A `core/signup` area with four public routes

All server code lives in `apps/api/src/modules/core/signup/` and mounts at `/api/public/signups` (the coordinator adds `.route('/signups', signup.publicApi)` to `modules/index.ts`; `scripts/openapi/sections.ts` lists the router under "Auth, me and invitations"):

| Route | Scope | Credential | Response |
|---|---|---|---|
| `GET /challenge` | none (no transaction) | none | `SignupChallenge` |
| `POST /` | `anonymous` | none | 202, no body |
| `POST /inspect` | `tokenScope(token, signedIn)` | token, not single use | `SignupInspect { email, companyName, possibleDuplicate }` |
| `POST /verify` | `tokenScope(token, signedIn)` | token, single use | `SignupVerified { tenantId, possibleDuplicate }` |

Request and response types live in `packages/shared/src/modules/core/api.signup.ts`: `SignupBody` (`salutation: 'mr' | 'ms' | null`, `givenName`, `familyName`, `email`, `password`, `companyName`, `country`, `taxIdType`, `taxIdValue`, `locale?`, `altcha`), `TokenBody` reused for inspect and verify. `route-cases.ts` exports `accountCases` for all four; the token cases use a magic-link token as `otherToken`. Inspect and verify live in `verify.redeem.ts`, the only place that switches scope.

Alternative: put the routes into `core/auth/routes.anonymous.ts`. Rejected: `/api/auth` is for existing accounts, and the token routes of every other flow sit under `/api/public`.

### 2. `tenant_signup` is an auth-owned table without RLS

New file `apps/api/src/modules/core/schema.signup.ts`:

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | `uuidv7()` |
| `status` | text | no | `pending_email`, `verified`, `superseded` (check) |
| `email` | citext | no | **PD** |
| `salutation` | text | yes | `mr`, `ms` (check); **PD** |
| `given_name`, `family_name` | text | no | **PD** |
| `password_hash` | text | yes | scrypt; set to NULL by the claim |
| `company_name` | text | no | 1 to 120 characters |
| `country` | char(2) | no | |
| `tax_id_type`, `tax_id_value` | text | no | normalized (decision 7) |
| `locale` | text | yes | `de`, `en`, `pl` |
| `token_hash` | bytea | no | unique, `sha256` of the `signup` token |
| `expires_at` | timestamptz | no | 24 hours after creation |
| `verified_at` | timestamptz | yes | |
| `tenant_id` | uuid | yes | FK `org` on delete cascade; indexed |
| `user_id` | uuid | yes | FK `app_user` on delete cascade; indexed |

Checks: `status <> 'pending_email' or password_hash is not null`; `status <> 'verified' or verified_at is not null`. Partial unique index `(email) where status = 'pending_email'`. Index `(expires_at)` for retention.

No party owns a registration before it is claimed: it has no tenant, and the person has no account. A policy for `anonymous` could not limit an update to "rows of the email in this request", which superseding needs. The table therefore follows `auth_token`: RLS off, imports restricted by Biome to `core/signup/` and `privacy/jobs/retention.ts` (the coordinator adds a `**/core/schema.signup.ts` rule to `biome.json`), and `tenant_signup` joins `WITHOUT_RLS` in `rls.test.ts`.

Alternative: RLS with `anonymous` insert and `token` select and update by `token_hash`, like `carrier_registration`. Rejected because superseding would then need a security-definer function (custom SQL) or a second scope switch.

### 3. Tenant facts as `org` columns with checks, not a `tenant_profile` table

`org` gains `tax_id_type`, `tax_id_value`, `tax_id_status` (`pending`, `verified`, `unverified`, `unavailable`), `tax_id_checked_at`, `possible_duplicate boolean not null default false` and `activated_at`. Checks:

- `org_tenant_facts_check`: `kind = 'tenant' or (tax_id_type is null and tax_id_value is null and tax_id_status is null and tax_id_checked_at is null and not possible_duplicate and activated_at is null)`.
- `org_tax_id_check`: type, value and status are all null or all set; `tax_id_type` and `tax_id_status` in their lists.
- Index `(tax_id_value) where kind = 'tenant'` for the duplicate lookup.

Why columns: each fact is 1:1 with the tenant and has no lifecycle of its own; 03 reads `activated_at` and 04 `suspended_at` under every party that already reads the tenant's org (tenant, public link, carrier at tenant, driver), so a second table would need the same eight policies and a join in every gate; 04's list filters on them without a join. The trade-off: RLS is per row, so parties that see a tenant's org row could select these columns. No route selects them outside the platform and the tenant's own context, the tax id is printed on the company's invoices anyway, and a test asserts that the public link, carrier and driver responses carry none of them (risk below).

### 4. Person names on `app_user`

`app_user` gains `given_name`, `family_name` (text, nullable, **PD**) and `salutation` (text, nullable, check `in ('mr', 'ms')`, **PD**). `name` stays `not null` and is the display name everywhere; verification writes `"<given> <family>"`. No existing flow writes the new columns. `GET /api/me` does not return them in this change (no consumer yet).

### 5. Submission pipeline

`POST /api/public/signups` runs, in this order:

1. `validate('json', SignupBody)`: field rules and the tax id rules of decision 7 (422).
2. ALTCHA verification (decision 6): 422 at `["altcha"]`.
3. Disposable domain check (decision 8): 422 at `["email"]`, code `disposable_email`.
4. `signupAllowed(email, ip, now)`: `signup_ip` then `signup_request` through `consumeRateLimit`, each on its own connection and outside any transaction, as `registrationAllowed` does. Over a limit: 202, nothing else happens.
5. `hashPassword(password)`, on both paths, so the response time does not tell a known email from a new one.
6. One `anonymous` transaction: `accountByEmail`. Known: enqueue `core.signup-known-account` and stop. New: mark pending rows of the email `superseded`, insert the row with `token_hash = tokenHashFor('signup', id)` and `expires_at = now + 24 h`, enqueue `core.signup-verify`. The insert uses `on conflict do nothing` on the partial unique index; a concurrent submission that loses still answers 202, because the winner's email went out.

`kernel/tokens.ts` gains the purpose `signup`. `RATE_LIMIT_BUCKETS` and `RATE_LIMITS` gain `signup_request` (3 per hour), `signup_ip` (20 per hour) and `altcha_solution` (decision 6); the bucket check regenerates in the migration.

### 6. ALTCHA proof of work, verified by our API

- API: `altcha-lib` (MIT) creates challenges in `core/signup/altcha.ts` with an HMAC key derived from `TOKEN_SECRET` (`HMAC(TOKEN_SECRET, "altcha")`), so no new secret is needed and the dev key differs from production. Challenges expire after 10 minutes; the cost targets about one second on a mid-range phone and is a constant in the file.
- Replay: after `verifySolution` succeeds, `consumeRateLimit('altcha_solution', <challenge signature>, now)` with limit 1 and a 10-minute window records the solution; a second use hits the limit and answers 422 at `["altcha"]`. This reuses the existing table and its 24-hour cleanup instead of a new store.
- Web: the `altcha` widget (MIT, a web component) with `challengeurl="/api/public/signups/challenge"`, wrapped in `apps/web/src/modules/core/altcha-field.tsx` as a react-hook-form `Controller` field. It solves automatically when the form is submitted, needs no cookie, loads nothing from a third party, and gets its labels from `core:signup.altcha.*` in the page language.
- Both packages are pinned exactly; the integration test solves a real challenge with `altcha-lib`'s solver, so a protocol mismatch between widget and library fails CI.

Alternatives: hCaptcha, reCAPTCHA or Turnstile load third-party scripts and set or read identifiers, which needs consent and contradicts "no third-party scripts" for public pages. Honeypot fields alone stop only naive bots. Rate limits alone let one address create 20 accounts per hour without cost.

### 7. Tax id rules in `packages/shared`, check digits through `jsvat`

`packages/shared/src/modules/core/tax-id.ts` exports `TAX_ID_TYPES`, `TAX_ID_STATUSES`, `normalizeTaxId(type, value, country)`, `checkTaxId(type, value, country)` (returning `ok`, `tax_id_format`, `tax_id_checksum` or `tax_id_country`), `initialTaxIdStatus(type)` and `taxIdEquivalents(type, value)`. `SignupBody` calls them in a `superRefine`, so the form (through `zodResolver`) and the API apply the same rules and the API stores the normalized value.

- `eu_vat`: `jsvat` (MIT, no dependencies, format and check digit per member state) with the EU-27 country list; the prefix of the chosen country is added when missing (`EL` for `GR`).
- `pl_nip`: 10 digits, weights 6 5 7 2 3 4 5 6 7, sum mod 11 equals the last digit (10 is invalid).
- `de_stn`: a W-IdNr `DE` + 9 + 5 digits, whose 9 digits pass the German VAT check digit (ISO 7064 MOD 11,10, also through `jsvat`); otherwise a 10- or 11-digit state tax number or a 13-digit federal tax number, format only, because the check-digit procedure differs per federal state.
- `taxIdEquivalents` lists the forms that name the same registration: `pl_nip` `N` ≡ `eu_vat` `PLN`; a W-IdNr ≡ the `eu_vat` of its first 11 characters.
- `initialTaxIdStatus`: `pending` for `eu_vat`, `unverified` otherwise.

Alternative: an own check-digit table for 27 states. Rejected: about 27 algorithms to get right and keep current, where a small, tested library exists. Alternative: `validator`'s `isVAT`: format only.

### 8. Disposable domains: a vendored CC0 list

`core/signup/disposable-domains.txt` is a copy of `disposable_email_blocklist.conf` from github.com/disposable-email-domains/disposable-email-domains (CC0), with a header line naming the source commit and date. `disposable-domains.ts` loads it once into a `Set` and matches the email's domain and each parent domain. The list is updated by replacing the file in a normal commit; the API never fetches it at runtime. The npm package of the same name is a different, older list and is not used.

### 9. Verification in one transaction under the token scope

`inspectSignup` and `verifySignup` in `core/signup/verify.redeem.ts`. The page first calls inspect and shows email, company and, when flagged, the duplicate hint; only the click calls verify (login CSRF, as for magic links in ADR-0003). `verifySignup`:

1. Select the row by `token_hash` with `status = 'pending_email' and expires_at > now`; none: 401 `unauthorized`.
2. `accountByEmail(email)`; found: 409 `conflict` with reason `account_exists`, nothing claimed.
3. Claim: `update tenant_signup set status = 'verified', verified_at = $now, password_hash = null where id = $id and token_hash = $h and status = 'pending_email' and expires_at > $now returning id`. No row: 401. A concurrent second claim waits for the row lock and then matches nothing.
4. `possibleDuplicate(tx, row)` (decision 10).
5. Insert `app_user` (id generated in the app, `email_verified_at = now`, the hash read in step 1, names, salutation, locale) with `on conflict do nothing`; no row: 409 `account_exists` (another flow created the email in between) and the transaction rolls back.
6. Insert `org` (kind `tenant`, name, country, normalized tax id, `initialTaxIdStatus`, `possible_duplicate`, `activated_at` null) and `tenant_subscription` (`start`, `updated_by` the new user).
7. `asScope` as the new tenant with actor `systemActor('signup')`: insert the `tenant_admin` membership.
8. Set `tenant_id` and `user_id` on the registration row.

The route then calls `startSession` in the same transaction and answers `{ tenantId, possibleDuplicate }`. The page clears the query cache and navigates to `/t/$orgId`.

New RLS rights for the `token` party, as narrow as the rows a registration writes: `org` insert where `kind = 'carrier' or (kind = 'tenant' and activated_at is null)` (the existing carrier policy widened; 04 may add `suspended_at is null`); `tenant_subscription` insert where `package = 'start'`. A token holder can therefore only ever create an onboarding tenant on the free package; every existing tenant already has its one subscription row (primary key). `rls.test.ts` and `test/model.ts` get the new oracle rows.

Alternative: switch to the platform party for the whole creation. Rejected: RLS would then not limit what a token holder's request can write.

### 10. Duplicate detection reads across tenants as the platform, and returns a boolean

`core/signup/duplicates.redeem.ts` (`*.redeem.ts`, so it may switch scope) runs one statement under a platform scope with the nil user id, the scope the retention job already uses for platform data:

- another tenant whose `(tax_id_type, tax_id_value)` is one of `taxIdEquivalents`, or a `de_stn` W-IdNr starting with the registration's `eu_vat`; or
- a membership in a tenant org whose user's email domain equals the registration's domain, unless the domain is in `core/signup/free-mail-domains.ts` (gmail.com, googlemail.com, outlook.com, hotmail.com, live.com, yahoo.com, icloud.com, proton.me, protonmail.com, gmx.de, gmx.net, web.de, t-online.de, freenet.de, wp.pl, o2.pl, onet.pl, interia.pl, op.pl).

It returns only `true` or `false`, so nothing about the other tenant reaches the token holder. The retention job's local `PLATFORM` constant moves to `kernel/system.ts` as `platformSystemScope` and both use it.

Alternative: grant the `system` party `select` on `membership` and `app_user`. Rejected: every job would then read every user.

### 11. Tenant status as a derived value

`packages/shared/src/modules/core/tenant-status.ts`: `TENANT_STATUSES = ['onboarding', 'active']` and `tenantStatus({ activatedAt })`. 04 adds `suspended` there. `createTenant` (PL-01) leaves `activated_at` null. The platform list (01's `TenantListQuery`) gains the facet `status`, filtered as `activated_at is null` or `is not null`, and `TenantSummary` gains `status`; the web list adds the Status column (text plus icon) and filter.

Backfill: `update org set activated_at = created_at where kind = 'tenant' and activated_at is null`. Drizzle cannot express it, so per ADR-0001 point 8 the coordinator lands it as a custom migration directly after the generated one (`pnpm db:generate --custom --name 02-tenant-self-registration-backfill`). Until then, existing tenants read as onboarding, which only 03's gating would act on.

### 12. VIES check as a job with an injected client

`apps/api/src/modules/core/jobs/tax-id-check.ts` exports `makeTaxIdCheckJob(client)` and `job = makeTaxIdCheckJob(viesClient(env.VIES_URL))`, named `core.tax_id_check`, every 300 seconds. Each tick, under `platformSystemScope`, it takes up to 50 tenants with `tax_id_type = 'eu_vat'` and either `tax_id_status = 'pending'`, or `unavailable` with `tax_id_checked_at` older than 1 hour and `created_at` newer than 7 days, oldest first.

`viesClient` posts `{ countryCode, vatNumber }` to `<VIES_URL>/check-vat-number` (the EC REST API, `https://ec.europa.eu/taxation_customs/vies/rest-api`, spec at https://ec.europa.eu/assets/taxud/vow-information/swagger_publicVAT.yaml) with a 10-second timeout and maps: 200 `valid: true` → `verified`; 200 `valid: false` or error `INVALID_INPUT` → `unverified`; any other error (`MS_UNAVAILABLE`, `TIMEOUT`, `MS_MAX_CONCURRENT_REQ`, `GLOBAL_MAX_CONCURRENT_REQ`, `SERVICE_UNAVAILABLE`), a network error or a timeout → `unavailable`. It writes `tax_id_status` and `tax_id_checked_at` and returns counts per result.

`kernel/env.ts` gains `VIES_URL` (URL or empty, default the EC address). Empty disables the client: the job returns at once. `.env.example` sets it empty, so `pnpm dev` and the tests never call the EC service; tests pass a fake client to `makeTaxIdCheckJob`.

### 13. Emails and greeting

Two `account` templates in `apps/api/src/modules/core/emails/`:

- `signup-verify.tsx`: payload `{ signupId, companyName, salutation, givenName, familyName }`; link `${APP_ORIGIN}/signup/verify#${deriveToken('signup', signupId)}`; states the 24-hour validity and "ignore this email if you did not register".
- `signup-known-account.tsx`: payload `{ locale }` only; says an account exists, links `/login`, mentions the password reset there.

`core/emails/greeting.ts` builds the greeting of the person-names spec from `t` and the three fields. Strings live in the new part `packages/i18n/locales/{de,en,pl}/core/signup.json` (form, sent screen, verify page, duplicate hint, ALTCHA labels, emails). The known-account email uses the account's locale, else the page's. The outbox worker empties both payloads on send.

### 14. Retention

`privacy/jobs/retention.ts` gains `signupRows`: `delete from tenant_signup where expires_at < now - 7 days` (every status: a verified row's link expired 24 hours after creation, so it goes 8 days after the registration and nothing of it outlives its purpose). The anonymization branch also sets `given_name`, `family_name` and `salutation` to NULL. Counts go to the job log.

### 15. Web pages

- `apps/web/src/routes/signup/index.tsx`: `AuthLayout` with the form in `modules/core/signup-form.tsx` (react-hook-form, `Controller`, shadcn `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `zodResolver(SignupBody)`): salutation as `RadioGroup` ("No answer" first and preselected), names, email, password, company, country (`NativeSelect`, EU-27, sorted by translated name), tax id type (`NativeSelect`, filtered to the types valid for the country) and value with an example per type in `FieldDescription`, the ALTCHA field, submit. 422 issues land on fields through `applyServerIssues`; `useFieldMessage` learns `disposable_email`, `tax_id_format`, `tax_id_checksum`, `tax_id_country` and `altcha_failed`. After 202 it shows "Check your inbox" with the address and "Send again", which re-sends the kept values with a fresh challenge.
- `apps/web/src/routes/signup/verify.tsx`: reads the fragment with `useFragmentToken`, calls inspect, shows email, company and the hint, and calls verify on "Create company" / "Create company anyway". 401 shows "invalid or expired" with a link to `/signup`; 409 `account_exists` shows "you already have an account" with a link to `/login`.
- `routes/login.tsx` links "Register your company".
- The office viewport rules apply (1920 × 1080 screenshots); the form fits one column of `AuthLayout`.

### 16. ADRs

`docs/decisions/ADR-0016-tenant-self-registration.md` records decisions 2, 3, 6, 7, 8, 9, 10 and 12: open self-registration without approval and its abuse controls, ALTCHA and `jsvat` as new dependencies, the vendored list, `tenant_signup` without RLS, the `token` rights on `org` and `tenant_subscription`, the platform-scope duplicate read, and the first outbound HTTP call (VIES) behind an injected client. ADR-0003 ("Sign-up paths", "Abuse limits", "Tokens"), ADR-0002 (party table), ADR-0010 (job table) and ADR-0011 (route map) are amended.

## Risks / Trade-offs

- [Mass sign-ups by scripts that solve the proof of work] → ALTCHA raises the cost per request, `signup_ip` caps one address at 20 per hour, each tenant needs a working mailbox, and the platform admin can suspend (04). Disposable domains are refused.
- [Email bombing a victim through the form] → `signup_request` caps one address at 3 emails per hour, and a known address gets only the short "you already have an account" email.
- [The duplicate hint reveals that some tenant uses a tax id or domain] → only to someone who confirmed a mailbox, without naming the tenant, and under the rate limits; the brief asks for the hint.
- [Tenant facts on `org` are readable by every party that reads the org row] → routes select explicit columns; `signup.test.ts` asserts that `GET /api/public/links/:slug`, the carrier's tenant list and the driver view carry no tax id fields.
- [The pending row holds a password hash for up to 24 hours] → scrypt hash only, NULL on claim, row deleted 7 days after expiry, table outside every RLS party and import-restricted.
- [`jsvat` falls behind a member state's format change] → a valid number is refused until updated; the error names the field, and VIES stays the authority for `verified`. The library is pinned and its tests run in `tax-id.test.ts` for each EU-27 sample.
- [VIES is slow or down for days] → the status reads `unavailable`, retries stop after 7 days, and nothing blocks; 04 shows the status.
- [The backfill lands after the generated migration] → between the two, existing tenants read as onboarding; 03's gating must not merge before the backfill.
- [Login CSRF through a forwarded verification link] → the page shows email and company and creates only on click.

## Migration Plan

1. Generated migration `pnpm db:generate --name 02-tenant-self-registration`: the `org` and `app_user` columns and checks, `tenant_signup`, the widened `token_insert` policy on `org`, the new `token_insert` policy on `tenant_subscription`, the bucket check.
2. Custom migration by the coordinator: the `activated_at` backfill (decision 11).
3. Deploy with `VIES_URL` unset (default EC address) in production.

Rollback: drop the route mount and the job; the columns and the table can stay, since nothing else reads them. Dropping them needs a reverse migration and loses the registrations.

## Seed data

`apps/api/scripts/seed/core.ts` (existing) adds to Acme Logistics the `eu_vat` `DE136695976` with status `verified` and `tax_id_checked_at`, and `activated_at` equal to its `created_at` when null; Anna Lenz gets `given_name` "Anna", `family_name` "Lenz", salutation `ms`. Found by org name and email, written with `update ... where`, so reruns converge.

New `apps/api/scripts/seed/signups.ts`, registered in `SEEDS` right after `core`:

| Name | Shows | Rows |
|---|---|---|
| Nordhafen Kühllogistik GmbH | a self-registered tenant in onboarding, `de_stn` W-IdNr `unverified` | org (DE, `start`, `activated_at` null), `admin@nordhafen.local` "Jonas Petersen", no salutation, locale `de`, `tenant_admin` |
| Acme Logistik Süd GmbH | the duplicate flag, `eu_vat` `pending` (the VIES job is off in dev) | org with Acme's VAT number, `possible_duplicate` true, `admin@acme-sued.local` "Lena Vogt", salutation `ms` |
| Wisła Magazyny Sp. z o.o. | `eu_vat` `unavailable`, Polish greeting | org (PL, `PL5260250274`), `admin@wisla-magazyny.local` "Piotr Zieliński", salutation `mr`, locale `pl` |
| `kontakt@kuehlhaus-weser.local` | a pending registration whose link works | one `pending_email` row expiring 24 hours after the seed run, one older `superseded` row |
| `info@lagerhaus-elbe.local` | an expired registration that retention deletes later | one `pending_email` row whose link expired 2 days before the seed run |

All accounts use `DEMO_PASSWORD`. Tenants and users are found by org name and email; registration rows by email and status, and their times are reset on each run, so two runs converge. The seed logs the verification link of the Weser registration (derived with `deriveToken('signup', id)` and the dev `TOKEN_SECRET`), so `pnpm db:seed` + `pnpm dev` lets a developer open it and create "Kühlhaus Weser GmbH" without the form. The onboarding tenants have no sites; 03's seed decides whether to give them any.

## Open Questions

Defaults the design assumes; none of them changes the specs or tasks.

- VIES says the number is invalid: flag only (`unverified`), no block. Non-EU companies (CH, UK): not offered in the MVP; the country list is EU-27.
- Tenants that verify but never finish onboarding: no automatic deletion in the MVP; the platform admin sees them (04).
- A person with an existing account (for example a carrier user) registering: gets the "you already have an account" email; creating a second org from an existing account comes later with join requests.
- Impersonation: later (MVP scope LATER list).
- Size of the free `start` package: unchanged.
- A platform switch that closes self-registration (for example during an incident): not built; a setting `core.self_signup_enabled` can be added through the coordinator if wanted.
- The brief gives 04 the story IDs PL-05 and following, but PL-05 is the retention job in `mvp-scope.md`; 04 should start at PL-06.
- `de_stn` state tax numbers are checked by format only; a per-state check digit can follow if false entries show up.
