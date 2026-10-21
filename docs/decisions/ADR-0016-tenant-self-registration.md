---
title: ADR-0016 Tenant self-registration without approval
description: Why warehouse operators register their own tenant at /signup without manual approval, and the controls that make it safe to leave open (ALTCHA, rate limits, a vendored disposable-domain list, tax id checks with jsvat and VIES), the tenant_signup table without RLS, the token party's new rights, and the platform-scope duplicate read.
type: explanation
audience: [agent, developer]
tags: [adr, auth, security, tenancy, registration, tax-id, rls, jobs]
status: stable
updated: 2026-10-21
related: [docs/decisions/ADR-0002-tenancy-isolation-rls.md, docs/decisions/ADR-0003-authentication-self-built-sessions.md, docs/decisions/ADR-0010-email-outbox-job-runner.md, docs/reference/data-model.md, docs/reference/api-routes.md, docs/how-to/register-your-company.md, openspec/changes/02-tenant-self-registration/design.md]
---

# ADR-0016: Tenant self-registration without approval

Status: accepted, 2026-10-21 (change 02, stories RG-01 to RG-05). Amends [ADR-0003](ADR-0003-authentication-self-built-sessions.md) "Sign-up paths", [ADR-0002](ADR-0002-tenancy-isolation-rls.md) (the `token` party), [ADR-0010](ADR-0010-email-outbox-job-runner.md) (the job table) and [ADR-0011](ADR-0011-frontend-routes-and-org-context.md) (the route map).

## Context

Until change 02, a tenant existed only when a platform admin created it and invited its first admin (PL-01), and ADR-0003 said "there is no sign-up endpoint". The product owner decided that warehouse operators register themselves: a person enters an optional salutation, first and last name, email, password, company name, country and tax id, confirms the email, and becomes `tenant_admin` of a new tenant on the free `start` package. Changes 03 (onboarding), 04 (platform tenant views) and 05 (Stripe) read the tenant status and the registration data.

A public form that creates tenants without approval invites scripted mass sign-ups, email bombing through the form, account enumeration, and fake companies. The public pages load no third-party scripts and set no tracking identifiers, so a hosted CAPTCHA is not an option.

## Decision

### 1. Open self-registration, no approval step

`POST /api/public/signups` writes one pending row and one email; `/signup/verify#<token>` creates the tenant on one click. Nobody approves a registration. The abuse controls below raise the cost of each tenant, and the platform admin can suspend a tenant afterwards (change 04). The answer to the form is always 202 with no body, whether the email is new, known, or over a limit, as OWASP recommends for registration and reset flows. A known email gets a short "you already have an account" email in the account's language, else the page's, and no row is written.

### 2. `tenant_signup` is an auth-owned table without RLS

No party owns a registration before it is claimed: it has no tenant, and the person has no account. A policy for `anonymous` could not limit an update to "rows of the email in this request", which superseding the previous pending row needs. The table therefore follows `auth_token`: RLS off, imports restricted by Biome to `core/signup/` and `privacy/jobs/retention.ts`, listed in `WITHOUT_RLS` in `db/rls.test.ts`. The row holds the scrypt hash until the claim sets it to NULL; the retention job deletes every row 7 days after its link expired.

Rejected: RLS with an `anonymous` insert and a `token` update by `token_hash`, like `carrier_registration`. Superseding would then need a security-definer function or a second scope switch.

### 3. Tenant facts are `org` columns, not a `tenant_profile` table

`org` gains `tax_id_type`, `tax_id_value`, `tax_id_status`, `tax_id_checked_at`, `possible_duplicate` and `activated_at`, tied to `kind = 'tenant'` by the check `org_tenant_facts_check`. Each fact is 1:1 with the tenant and has no lifecycle of its own, and 03 and 04 read them under every party that already reads the tenant's org row. A second table would need the same policies and a join in every gate.

Trade-off: RLS is per row, so a party that sees a tenant's org row could select these columns. No route selects them outside the platform and the tenant's own context, and `signup.test.ts` asserts that the public link, carrier and driver responses carry none of them.

### 4. ALTCHA proof of work, verified by our API

- `altcha-lib` 2.6.0 (MIT, API) issues PBKDF2/SHA-256 challenges in `core/signup/altcha.ts`, signed with `HMAC(TOKEN_SECRET, "altcha")`, so no new secret exists and the dev key differs from production. The cost targets about one second on a mid-range phone.
- A challenge expires 10 minutes after it was issued. The expiry travels in the signed challenge `data` and is compared with the injected clock. altcha-lib's own `parameters.expiresAt` is not used, because the library checks it against the wall clock, and the API's time comes from the injected `Clock`, which tests set to other instants.
- Replay: a verified solution is recorded with `consumeRateLimit(RateLimitBucket.altcha_solution, <challenge signature>)`, limit 1 in 10 minutes. A second use answers 422 at `["altcha"]` with code `altcha_failed`. This reuses `rate_limit_event` and its 24-hour cleanup instead of a new store.
- `altcha` 3.4.1 (MIT, web component) solves in the browser on submit, sets no cookie and loads nothing from a third party. Both packages are pinned exactly; the integration test solves a real challenge with altcha-lib's solver, so a protocol mismatch fails CI.

Rejected: hCaptcha, reCAPTCHA and Turnstile load third-party scripts and set or read identifiers, which needs consent. Honeypot fields alone stop only naive bots. Rate limits alone let one address create 20 tenants per hour at no cost.

### 5. Rate limits that answer 202

`signup_ip` (20 per hour per client address) and `signup_request` (3 per hour per email) are consumed on their own connections before the request transaction, as for the public-link registration (CR-02). Over a limit the route still answers 202 and writes nothing, so the limits cannot be used to probe accounts. `signup_request` also caps the emails one victim can receive through the form.

### 6. Tax id rules in `packages/shared`, check digits through `jsvat`

`packages/shared/src/modules/core/tax-id.ts` normalizes and checks the three types `eu_vat`, `de_stn` (state or federal tax number, or W-IdNr) and `pl_nip`. `SignupBody` calls the check in a `superRefine`, so the form (through `zodResolver`) and the API apply the same rules. A failing check is a 422 issue with the code `tax_id_format`, `tax_id_checksum` or `tax_id_country`: the refinement sets `params.code`, and `kernel/validate.ts` uses a refinement's `params.code` as the issue code in place of zod's `custom`.

- `eu_vat`: `jsvat` 2.5.4 (MIT, no dependencies) checks format and check digit per member state. The country prefix is added when missing, `EL` for Greece.
- `pl_nip`: weights 6 5 7 2 3 4 5 6 7, sum mod 11 equals the last digit.
- `de_stn`: a W-IdNr (`DE` + 14 digits) whose first 11 characters pass the German VAT check; otherwise 10, 11 or 13 digits, format only, because the check-digit procedure differs per federal state.

Rejected: an own check-digit table for 27 states (27 algorithms to keep current), and `validator`'s `isVAT` (format only).

**Risk: `jsvat` is marked unmaintained on npm.** Version 2.5.4 is the last release. A member state that changes its VAT format would have valid numbers refused with `tax_id_format` or `tax_id_checksum` until we patch. Mitigation: the version is pinned, `tax-id.test.ts` checks a sample for each EU-27 state, VIES stays the authority for `verified`, and the rules sit behind `checkTaxId`, so replacing the library touches one file.

### 7. Disposable domains: a vendored CC0 list

`core/signup/disposable-domains.txt` is a copy of `disposable_email_blocklist.conf` from [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) (CC0 1.0), commit `b63df8b` of 2026-10-19. Its header line names the commit. `disposable-domains.ts` loads it once into a `Set` and matches the email's domain and every parent domain; a match is a 422 at `["email"]` with code `disposable_email`. The list is updated by replacing the file in a normal commit; the API never fetches it at runtime. The npm package of the same name is a different, older list and is not used.

### 8. Verification in one transaction under the token scope

`/signup/verify#<token>` first calls `POST /api/public/signups/inspect`, which shows email, company and the duplicate hint without using the link. Only the click calls `POST /api/public/signups/verify`, so a forwarded link cannot sign a browser in silently (login CSRF, as for magic links in ADR-0003). `verifySignup` in `core/signup/verify.redeem.ts` claims the row with one guarded `update ... where token_hash = $h and status = 'pending_email' and expires_at > $now returning`, then checks for an account with the email (409 `account_exists`, and the rollback leaves the row pending), then inserts the user, the `org` (kind `tenant`, `activated_at` null), the `start` subscription and, through `asScope` as the new tenant with the system actor `signup`, the `tenant_admin` membership. The route starts the session in the same transaction. The loser of a concurrent claim waits for the row lock and then matches nothing: always 401.

### 9. New rights for the `token` party

The `token` party may insert an `org` row where `kind = 'carrier' or (kind = 'tenant' and activated_at is null)`, and a `tenant_subscription` row where `package = 'start'`. A token holder can therefore only ever create an onboarding tenant on the free package; every existing tenant already has its one subscription row (primary key). The policies, the oracle rows in `rls.test.ts` and the party matrix in `test/model.ts` cover them.

Rejected: switching to the platform party for the whole creation. RLS would then not limit what a token holder's request can write.

### 10. Duplicate detection reads across tenants as the platform and returns a boolean

`core/signup/duplicates.redeem.ts` runs one statement under `platformSystemScope` (`kernel/system.ts`, the platform scope with the nil user id that the retention job also uses). It looks for another tenant whose tax id is one of `taxIdEquivalents` (a NIP and its `PL` VAT number, a W-IdNr and its VAT number), or a tenant member whose email has the registration's domain unless that domain is a free-mail domain (`core/signup/free-mail-domains.ts`). It returns only `true` or `false`, so nothing about the other tenant reaches the token holder. A flagged registration still creates its tenant, with `possible_duplicate` set for the platform admin.

Rejected: granting the `system` party `select` on `membership` and `app_user`. Every job could then read every user.

### 11. The VIES check is a job behind an injected client

This is the API's first outbound HTTP call. `core/jobs/tax-id-check.ts` exports `makeTaxIdCheckJob(client)`; the registered job `core.tax_id_check` uses `viesClient(env.VIES_URL)` and runs every 300 seconds. Each tick takes up to 50 `eu_vat` tenants that are `pending`, or `unavailable` with a check older than 1 hour and a tenant younger than 7 days. The client posts `{ countryCode, vatNumber }` to `<VIES_URL>/check-vat-number` of the EC's VIES REST API with a 10-second timeout: `valid: true` is `verified`; `valid: false` or `INVALID_INPUT` is `unverified`; any other VIES error, a network error or a timeout is `unavailable`. VIES never blocks a registration.

`VIES_URL` defaults to `https://ec.europa.eu/taxation_customs/vies/rest-api`. Empty disables the client and the job returns at once. `.env.example`, `apps/api/vitest.config.ts` and `playwright.config.ts` set it empty, so development and the tests never call the EC; tests pass a fake client to `makeTaxIdCheckJob`.

### 12. Salutation is optional and never inferred

The salutation is `mr`, `ms` or none, with "No answer" first and preselected, and is used only for the email greeting. Without it, emails greet neutrally with first and last name. The CJEU held in C-394/23 (Mousse) that requiring a title such as "Mr" or "Ms" is not necessary for a contract and fails data minimization, and the OLG Frankfurt held in 9 U 92/20 that a form forcing "Herr" or "Frau" discriminates against non-binary persons.

## Consequences

- Anyone with a working, non-disposable mailbox and a valid tax id format can create a `start` tenant. The cost per tenant is one proof of work, one mailbox, and the per-address and per-email limits.
- The duplicate hint tells a person who confirmed a mailbox that some tenant may use the same tax id or company domain, without naming it.
- Three new exact-pinned dependencies (`altcha-lib`, `altcha`, `jsvat`) and one vendored data file need updates by hand. `jsvat` is unmaintained (decision 6).
- Between the generated migration and the custom backfill migration of `activated_at` (`0008_02-tenant-self-registration-backfill.sql`), existing tenants read as onboarding; 03's gating must not merge before the backfill.
- Not built: joining an existing tenant from a registration, non-EU companies, a platform switch that closes self-registration, and per-state check digits for `de_stn`.

## Sources

- OWASP Cheat Sheet Series, [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) (generic responses, account enumeration) and [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) (same response for known and unknown accounts).
- CJEU, judgment of 9 January 2025, C-394/23, *Mousse v CNIL and SNCF Connect*.
- OLG Frankfurt am Main, judgment of 21 June 2022, 9 U 92/20.
- European Commission, VIES REST API specification: <https://ec.europa.eu/assets/taxud/vow-information/swagger_publicVAT.yaml>.
- disposable-email-domains, `disposable_email_blocklist.conf`, CC0 1.0: <https://github.com/disposable-email-domains/disposable-email-domains>.
