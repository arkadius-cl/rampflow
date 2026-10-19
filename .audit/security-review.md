# Security review: rampflow MVP (branch main, 2026-10-19)

Scope: auth (ADR-0003), tenancy and RLS (ADR-0002), driver tokens (ADR-0008), outbox (ADR-0010), input handling, production configuration. Method: full read of `apps/api/src/kernel`, `db`, every `routes.*.ts`, every `*.redeem.ts`, the schemas and their policies, the email templates, the web and driver auth pages; the API suite (`pnpm --filter @rampflow/api test`: 583 passed, 1 unrelated seed-fixture failure in `scripts/seed/sites.test.ts`); and probes against a throwaway server on port 3950 with a scratch database (`rampflow_audit`, seeded through `POST /api/test/seed`). Throwaway probe scripts (`/tmp/probe.mjs`, `/tmp/probe2.mjs`, `/tmp/probe-timing.mjs`, `/tmp/drizzle-err-probe.mjs`) ran plain `fetch` calls with `Origin: http://localhost:3950` and derived emailed tokens from row ids with the dev `TOKEN_SECRET`; each finding below lists the exact requests. Server (stopped by PID), database and scripts were removed afterwards.

CONFIRMED = reproduced with a request or a library call. PLAUSIBLE = established from reading only.

## Findings, ranked

### 1. Medium. A password reset leaves every other reset and magic-link token of the user valid

CONFIRMED (`/tmp/probe.mjs`, P3).

`redeemPasswordReset` claims the one token it was given, sets the password and deletes the user's sessions, but never touches the user's other `auth_token` rows. `claimAuthToken` accepts any row that is unused and unexpired. So the remedy CR-03 prescribes after a suspected compromise (reset the password, which "revokes all other sessions") does not evict an attacker who already holds a link.

Scenario: the attacker has transient read access to the victim's mailbox (shared inbox, forwarding rule, a phone left unlocked) and requests `POST /api/auth/password-reset {email}` (and, for a second foothold, `POST /api/auth/magic-link {email}`). The victim notices the mail, resets the password through their own link, and believes the account is secured. Within the token windows (60 min reset, 15 min magic link) the attacker posts the older token:

```
POST /api/auth/password-reset/confirm {"token": "<older reset token>", "password": "attacker-password"}  -> 200 {ok:true}
POST /api/auth/magic-link/exchange      {"token": "<magic link issued before the reset>"}             -> 200 {ok:true}
```

Both succeed after the victim's reset; the first also locks the victim out again. The probe issued two reset tokens, used the first, then used the second (200), signed in with the attacker password (200), and exchanged a magic link issued before a further reset (200).

Pointers: `apps/api/src/modules/core/auth/password-reset.redeem.ts:14-31`, `apps/api/src/modules/core/auth/tokens.ts:40-59`.

Fix: in `redeemPasswordReset`, after the claim, `update auth_token set used_at = now where user_id = $user and used_at is null`; do the same when a user signs in by password after a reset if desired. Consider also invalidating older reset tokens when a new one is issued.

### 2. Medium. Any member of a carrier, including `carrier_user`, can bind the whole carrier company to a tenant; the tenant sees a typed company name, not the org it is linking

CONFIRMED (`/tmp/probe.mjs` P2, `/tmp/probe2.mjs` P32).

`carrierOfUser` resolves "the carrier org the user acts for" from the redeeming user's existing memberships, preferring `carrier_admin` but falling back to any membership, and ignores the company name the tenant typed or the registrant entered. Both redemption paths use it: carrier invitations (`acceptCarrierInvitation`) and public-link registrations (`verifyRegistration`). No carrier-side permission is checked (there is no permission for "link this company to a tenant"; `core.manage_carrier_users` is admin-only, but linking bypasses it).

Scenario A (self-service, no human in the loop): a `carrier_user` of Rival A, a low-privilege dispatcher or an ex-employee whose membership was not removed, opens tenant B's public booking link (the slug is public by design), registers with any company and contact name, and confirms:

```
POST /api/public/links/<slug>/registrations {"companyName":"Shell Co","country":"PL","contactName":"Mallory","email":"<rival_user email>"}  -> 202
POST /api/public/registrations/verify {"token":"<emailed token>"}  (with the rival_user session)       -> 200 {"carrierId":"<Rival A>","status":"approved"}
```

With `booking.public_registration_mode = auto_approve` tenant B now has an active link to Rival A; `GET /api/t/<B>/carriers` lists "Rival A", while `GET /api/t/<B>/carriers/registrations` shows "Shell Co / Mallory / approved". With `approval_required` the tenant approves "Shell Co" and gets Rival A linked, because `RegistrationView` carries `companyName`/`contactName` from the form and no name of `carrier_id`.

Scenario B (invitation): tenant B invites "Totally New Co" at the address of a `carrier_user` of Carrier A. Accepting as that user (`POST /api/public/carrier-invitations/accept {token}` with their session) answered `{carrierId: <Carrier A>}`; Carrier A became an active link of tenant B and Carrier A's admin now sees tenant B in `GET /api/c/<A>/context`. The invited company name was discarded.

Consequences: the bound carrier's users (all of them) can book, reschedule and send driver links at that tenant in the carrier's name; the tenant's staff can read names and emails of the bound carrier's members (`app.shares_org`); a departed employee can keep attaching the former employer to tenants.

Pointers: `apps/api/src/modules/booking/carriers/carrier-org.redeem.ts:76-90` (membership fallback), `apps/api/src/modules/booking/carriers/accept.redeem.ts:90-93` (company name ignored), `apps/api/src/modules/booking/registration/verify.redeem.ts:44-47,68-75`, `apps/api/src/modules/booking/registration/registrations.ts:103-117` (view without the linked org), `apps/api/src/modules/booking/registration/registrations.ts:171-179`.

Fix: require `carrier_admin` to attach an existing org (answer 403 or create a new org for a `carrier_user`), show the org that will be linked (name and id) in `RegistrationView` and in the carrier-invitation inspect answer, and let the tenant confirm when it differs from the typed company.

### 3. Low to medium. Login CSRF and forced logout through a magic link of another account

CONFIRMED (`/tmp/probe2.mjs`, P31).

`startSession` deletes the session named by the request's `rf_session` cookie before creating the new one, and the magic-link exchange runs regardless of who is signed in. `/auth/magic#<token>` posts the fragment automatically on page load.

Scenario: the attacker requests a magic link for their own account, then sends the victim (a signed-in dispatcher) that link. Opening it ends the victim's session server-side (`GET /api/me` with the old cookie answered 401) and leaves the victim's browser signed in as the attacker. A dispatcher who then creates bookings or uploads data does so inside the attacker's org; the classic login-CSRF outcome. At minimum it is a one-click remote logout. The Origin check does not apply because the page itself performs the POST.

Pointers: `apps/api/src/modules/core/auth/sessions.ts:23-26`, `apps/api/src/modules/core/auth/routes.anonymous.ts:107-118`, `apps/web/src/routes/auth/magic.tsx:24-32`.

Fix: refuse the exchange (or ask for confirmation in the page) when a valid session of a different user is present; do not delete a foreign session as a side effect.

### 4. Low to medium. Production hardening keys on `NODE_ENV=production`, whose default is `development`

CONFIRMED by reading.

`NODE_ENV` defaults to `development` (`apps/api/src/kernel/env.ts:10`) and `.env.example:3` ships that value. Three protections hang on the value being exactly `production`: the refusal of the dev `TOKEN_SECRET` (`env.ts:27-30`), the refusal of `ENABLE_TEST_ROUTES=1` (`env.ts:23-26`), and `Secure` on `rf_session` (`apps/api/src/modules/core/auth/sessions.ts:17`, off only for `development`, which is the default). A deployment that forgets `NODE_ENV=production` therefore runs with the published HMAC key for every emailed and driver token, sends the session cookie over plain HTTP, and may expose `/api/test/*` (see finding 9). Startup does not refuse the dev secret outside `production`, so nothing fails loudly.

Fix: make the dev secret and test routes fail unless `NODE_ENV=development` or `test` is set explicitly; set `Secure` unless `NODE_ENV=development`; document the required production variables.

### 5. Low. The 500 handler logs Drizzle query errors, whose message embeds the bound parameters

CONFIRMED (`/tmp/drizzle-err-probe.mjs`): a failing statement produces `Failed query: insert into app_user (...) values ($1, $2, $3) ... params: victim@example.com,Victim,scrypt$16384$16$1$SALT$HASH`.

`onError` prints the whole error (`apps/api/src/kernel/errors.ts:76`). Any database error on a write of `app_user`, `avis`, `safety_acknowledgement` or `carrier_registration` puts emails, password hashes, driver names, phones and plates into the log. Raw tokens never reach the database as parameters (only hashes), so ADR-0003's "no log line contains a token" holds, but the privacy NFR does not. `kernel/jobs.ts:92,110` and `booking/jobs/no-show.ts:54` log errors the same way.

Fix: log `err.name`, `err.code`, `err.constraint` and the query text without `params`; unwrap `DrizzleQueryError.cause` and drop `message` for logs.

### 6. Low. No security headers on the API or the back-office SPA

CONFIRMED (`GET /api/health` answered with `content-type`, `content-length`, `date` and connection headers only).

`staticFiles` adds `Referrer-Policy` and a CSP for `/d` only (`apps/api/src/kernel/static.ts:21-32`). The SPA at `/` and every JSON answer lack `X-Content-Type-Options: nosniff`, `Content-Security-Policy` (or at least `frame-ancestors`), `Referrer-Policy` and `Strict-Transport-Security`. Session cookies are `SameSite=Lax`, so framing cannot ride the session, and React escapes output, which keeps the impact low. Add the headers in `app.ts` or at the proxy.

### 7. Low. Password sign-in runs scrypt for unknown emails with no per-address limiter

CONFIRMED: one unknown-email login costs about 150 ms (and 32 MB) of scrypt; 40 concurrent attempts finished in 862 ms with the server still answering `/api/health` in 2 ms.

`login_failed` is keyed by `sha256(email + ip)` (`apps/api/src/modules/core/auth/login-limit.ts:14-15`), so a client that rotates emails is never limited and can keep the libuv threadpool busy with the dummy hash (`routes.anonymous.ts:83`). The design is deliberate for the timing-equal path; add a coarse per-IP bucket (for example 60 attempts per minute) in front of it.

### 8. Low. Small timing oracle on the magic-link and reset request endpoints

CONFIRMED locally: median 8.5 ms for an existing account against 6.3 ms for an unknown one (`/tmp/probe-timing.mjs`), because a known address does two inserts (`issueAuthToken`, `enqueueEmail`) before the uniform 202 (`routes.anonymous.ts:51-70`). Weak over a network and bounded by 5 requests per hour per address, but it contradicts "answers nothing about the account". Doing the work in a detached task or adding a fixed delay removes it.

### 9. Low. Test routes are unauthenticated whenever they are mounted

CONFIRMED: `POST /api/test/clock {"now":null}` answered 200 with only the Origin header. `/api/test/seed` writes as the owner role, `/api/test/clock` pins the clock of every request and job, `/api/test/jobs/:name/run` runs jobs (`apps/api/src/kernel/test-routes.ts:18-30`, `apps/api/src/app.ts:44,56`). Only `NODE_ENV=production` refuses the flag (finding 4). On a staging host reachable from the internet this is a full takeover of the data. Gate them on a shared secret header or bind them to loopback.

### 10. Low. Registration verification does not re-check the public link at redemption time

PLAUSIBLE. `verifyRegistration` (`apps/api/src/modules/booking/registration/verify.redeem.ts:29-77`) reads only `booking.public_registration_mode`; it does not re-check `booking.public_link`, `booking.public_link_enabled`, the slug's `revoked_at` or the site's `active` flag that `openPublicLink` enforced when the form was submitted. A tenant that turns the link off (or regenerates a leaked slug) after a burst of registrations still gets them completed for 24 hours, and with `auto_approve` linked. Re-run `openPublicLink`'s checks before the claim.

### 11. Low. Outgoing SMTP has no authentication or TLS requirement

PLAUSIBLE. `smtpMailer` passes only host and port and sets `secure` for port 465 (`apps/api/src/kernel/mailer.ts:23-27`); there is no `auth`, no `requireTLS`. Production has to use an unauthenticated relay or accept opportunistic STARTTLS that can be stripped. Add `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_REQUIRE_TLS` to `env.ts`.

### 12. Low. The demo seed sets a published password on a platform admin and has no environment guard

PLAUSIBLE. `scripts/seed/core.ts:19` (`DEMO_PASSWORD = 'rampflow-demo'`) creates `admin@rampflow.local` as `platform_admin`; `seed-dev.ts` runs against whatever `MIGRATION_DATABASE_URL` names and never checks `NODE_ENV`. Refuse to run when `NODE_ENV=production` or when the database already holds a non-demo platform admin.

### 13. Low. Shared rate-limit keys behind a reverse proxy without `TRUST_PROXY=1`

PLAUSIBLE, documented. With `TRUST_PROXY=0` behind a proxy, `clientIp` is the proxy's address for everyone (`apps/api/src/kernel/rate-limit.ts:105-115`), so `driver_exchange` (10/min) and `registration_ip` (100/h) become global limits: one abusive client locks every driver out of the exchange. With `TRUST_PROXY=1` the code correctly takes the last `X-Forwarded-For` entry. Worth a startup warning when `TRUST_PROXY=0` and `APP_ORIGIN` is not localhost.

### 14. Low. `pnpm audit`: `braces` (GHSA-vfj7-8cjw-p6xm, high) through `shadcn` in `apps/web` devDependencies

CONFIRMED by `pnpm audit --prod`. Build-time only (the shadcn CLI); nothing ships it. Track it.

## Checked and found sound (one line each)

- Passwords: scrypt N=2^14, r=16, p=1, 16-byte salt, 64-byte key, `timingSafeEqual`, dummy hash for unknown and password-less accounts, NFKC normalisation, length 10 to 128 (`password.ts`, `api.auth.ts`).
- Sessions: 32 random bytes, only `sha256` stored, 30-day absolute and 7-day idle expiry, `disabled_at` re-checked per request, `HttpOnly; Secure; SameSite=Lax; Path=/` under `NODE_ENV!=development`; sign-out deletes the row; reset deletes every session.
- Emailed tokens: `HMAC-SHA256(TOKEN_SECRET, purpose:id)` with random v4 ids, only hashes stored, single guarded `UPDATE` claims (`claimAuthToken`, `acceptInvitation`, `acceptCarrierInvitation`, `verifyRegistration`, `exchangeDriverToken`), purposes separated, tokens only in URL fragments; the harness covers unknown, wrong-purpose, driver and reused tokens.
- Invitation acceptance cannot take over an existing account: an email with an account requires a session with that exact email (`signedInAs`, `redeemingUser`), new accounts are created only when none exists, `onConflictDoNothing` handles the race.
- Mass assignment: `PATCH /api/me` with `email`, `passwordHash`, `disabledAt` changed only `name` (CONFIRMED); zod strips unknown keys everywhere.
- CSRF: every `POST/PUT/PATCH/DELETE` under `/api` needs `Origin == APP_ORIGIN` (`origin.ts`), including the raw logo `PUT`, `/api/public/*` and `/api/test/*`; no CORS; the only GET with writes (`GET /api/driver/briefings`, pass redemption) sits behind a `SameSite=Strict` cookie scoped to `/api/driver`.
- Open redirects: `/login?redirect=` accepts only same-app paths (`login.tsx:28-30`), navigation is client-side; emails build links from `APP_ORIGIN`, never from `Host`.
- Tenancy: every policy is party-conditioned, `app.*()` accessors fail closed on `''`, `withScope` refuses nesting, `asScope` restores variables; the three `asScope` escapes in `booking/lifecycle/elevated.ts` return only a boolean, names of ids the caller already holds, or recipients; `kernel/access.ts` resolves foreign-party entitlements as a system actor without exposing `entitlement_override.note`. The party matrix and the route-case harness (foreign org, rival carrier, foreign site, permission, entitlement, control) pass for every guarded route; routes that take ids in bodies (`walk-ins`, `search`, `settings`, `capacity/*`, `staff/invitations.siteIds`) re-check the tenant and are covered by the "A's other ids in B" check.
- Platform admins see org, user, membership, subscription, override, invitation and platform-setting rows only; usage counts run per tenant as `system:usage`.
- Driver: 256-bit link token, `rf_driver` `HttpOnly; Secure; SameSite=Strict; Path=/api/driver; Max-Age=<expiry>` (CONFIRMED), `driver_exchange` 10/min/IP, the view omits name, phone and plate, `avis` has no driver policy, `rf_device` is 32 random bytes with only its hash stored, passes never redeem on `staff` sessions.
- Public link slugs: 10 base32 characters (50 bits), regenerate revokes; the setting is the on/off switch.
- Logo: PNG/JPEG by magic bytes, SVG refused, 256 KB enforced by `bodyLimit` and `parseLogo`, served with the stored content type and `X-Content-Type-Options: nosniff`.
- CSV: cells starting with `= + - @ \t \r` are prefixed with `'`, quotes doubled, negative numbers exempt only in the KPI export.
- Emails: React escapes every interpolated value (`escapeValue:false` in i18next is therefore safe), i18next's `skipOnVariables` default blocks `$t()` nesting from user values, nodemailer strips CR/LF from headers (`mime-node/index.js:1413-1420`), recipients are zod-validated emails, payloads hold ids not tokens and are emptied after sending.
- Errors: unknown errors answer `{code:"internal_error", details:{requestId}}` only; Hono messages pass through for 400 to 404.
- SQL: Drizzle parameters throughout; `sql.raw` only with regex-checked party names and enum literals; `ilike` input escaped.
- `GET /api/health` is unauthenticated and reveals database reachability only.

## Residual notes (not findings)

- `GET /api/t/:orgId/bookings/:id/driver-link` and the yard `briefing-session` hand the raw driver token to staff by design (CR-06, YD-02).
- A carrier user with `booking.book` may email the driver link to any address (CR-06); abuse is bounded by `notify.email` and the user's accountability.
- `auth_token` and `session` rows are never purged (retention only deletes expired `driver_access`); expiry is always checked, so this is housekeeping.
