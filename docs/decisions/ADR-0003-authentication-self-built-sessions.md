---
title: ADR-0003 Authentication with scrypt passwords and a session table instead of better-auth
description: Why rampflow builds its small identity layer on node:crypto scrypt, hashed session tokens and its own token tables, and the security rules that layer must keep.
type: explanation
audience: [agent, developer]
tags: [adr, auth, security, sessions, invitations]
status: stable
updated: 2026-10-19
related: [docs/explanation/research/tech-architecture.md, docs/explanation/mvp-scope.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md]
---

# ADR-0003: Authentication with scrypt passwords and a session table instead of better-auth

Status: accepted, 2026-10-19. This amends the scope's security line "Passwords use better-auth scrypt": passwords still use scrypt, through `node:crypto`.

## Context

The MVP needs:

- Email and password sign-in for platform, tenant and carrier users, with at least 10 characters and a verified email (CR-03).
- Magic-link sign-in: single use, 15 minutes (CR-03).
- Five failed passwords in 15 minutes for one email and IP return 429 (CR-03).
- Password reset that revokes all other sessions (CR-03).
- Invitations for staff, tenant admins, carrier users and carrier companies: single use, 7 days (PL-01, TN-01, TN-03, CR-01, CR-04).
- No public sign-up except through an enabled public booking link (CR-02).
- Removing a member ends that user's access to the tenant at once (TN-01).

The scope already decided that magic links and invitations are our own hashed token tables, not better-auth plugins. Memberships, orgs and roles are our own tables too ([ADR-0002](ADR-0002-tenancy-isolation-rls.md)). TypeScript 7 compatibility of better-auth's types is unverified, and its 2026 advisories cluster in exactly the plugins we would otherwise use.

## Options considered

| Option | What it would give us | What we would still build |
|---|---|---|
| better-auth core (`emailAndPassword`) | scrypt hashing, a session table, reset and verification flows, a generic IP rate limiter | Magic-link sessions: better-auth has no public API to create a session for a user after our own token check, so this means calling `internalAdapter` or enabling the magic-link plugin the scope rejected. The per-email-and-IP failure rule. Invitation-based account creation. Org, membership and site scoping. |
| **Self-built on `node:crypto`** | Nothing for free | scrypt hash and verify (about 40 lines), a hashed session table with rotation and revocation, token tables, the rate limit, an Origin check |
| Hosted IdP | Least code | Per-user cost for carriers and drivers who never pay; data residency questions; still needs our own tenancy model |

better-auth would own the easy half (password hashing, session rows) and leave us the hard half while adding a dependency with a high advisory cadence, an unverified compiler interaction, and a second session model next to our driver tokens. The self-built layer is small, uses only the standard library, and maps one-to-one onto the requirements above.

## Decision

Build identity in `apps/api/src/modules/core/auth/` on `node:crypto`. No auth library.

### Passwords

- `scrypt` with N = 2^14, r = 16, p = 1, a 16-byte random salt and a 64-byte key (the same cost better-auth uses). Stored as `scrypt$16384$16$1$<salt b64>$<hash b64>`, so the cost can rise later and old hashes still verify.
- Compare with `timingSafeEqual`. When the email is unknown, verify against a fixed dummy hash, so response time does not reveal accounts.
- Length 10 to 128 characters. No composition rules.
- Sign-in requires `email_verified_at`. Invitation acceptance and the public-link magic link set it, because both prove the mailbox.

### Sessions

- The cookie `rf_session` holds 32 random bytes in base64url. The `session` table stores only `sha256(token)` as its primary key.
- Cookie flags: `HttpOnly; Secure; SameSite=Lax; Path=/`. `Secure` is off only when `NODE_ENV=development`.
- Lifetime: 30 days absolute, 7 days idle. `last_seen_at` is updated at most every 5 minutes.
- Sign-in, magic-link exchange and invitation acceptance create a new session. Sign-out deletes the row. A password reset deletes every session of the user.
- **Membership changes take effect on the next request.** The session names a user, not an org. Every org-scoped request checks the membership again ([ADR-0002](ADR-0002-tenancy-isolation-rls.md)), so removing a member ends their access to that tenant without touching their sessions elsewhere.

### Tokens

- Magic links, password resets and staff invitations: 32 random bytes; the link carries the raw token in the URL fragment (`/auth/magic#<token>`, `/auth/reset#<token>`, `/invite#<token>`). The page posts it to an exchange endpoint, as the driver PWA does, so tokens never appear in request lines, logs or `Referer` headers.
- Storage is `sha256(token)` only. Lifetimes: magic link 15 minutes, reset 60 minutes, invitation 7 days. Each token is single use; the exchange marks it used in the same transaction that creates the session or membership.
- Requesting a magic link or reset always answers 202, whether or not the email exists.

### Abuse limits

- `rate_limit_event (bucket, key_hash, at)` counts events in Postgres, so a second API instance shares the limits.
- `login_failed`: 5 per 15 minutes per `sha256(lower(email) + ip)`, then 429 `rate_limited` with `retryAfterSeconds`.
- `magic_link_request` and `reset_request`: 5 per hour per email hash, then the API silently stops sending.
- `driver_exchange`: 10 per minute per IP ([ADR-0008](ADR-0008-driver-token-pwa-delivery.md)).
- The retention job deletes events older than 24 hours.

### Request integrity

- Every mutating request (`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Origin` header equal to `APP_ORIGIN`. Otherwise the API answers 403 `forbidden` before routing.
- The SPA and the API share one origin (Vite proxy in dev, one host in production), so no CORS configuration exists.

### Sign-up paths

There is no sign-up endpoint. Users come into existence in exactly three places: invitation acceptance (staff, tenant admin, carrier user, carrier company) and public-link registration (CR-02). Each path is a separate handler with its own route cases.

## Consequences

- No third-party auth code runs in the API, and the scope's "better-auth is pinned exactly" requirement no longer applies.
- We own the security properties above. U2 carries tests for each: timing-equal unknown-email path, single-use tokens under concurrent exchange, session revocation on reset, the 5-in-15 rule, the Origin check, and that no log line contains a token or cookie.
- SSO (`core.sso`, reserved) will need an OIDC client later. It plugs in as another way to create the same `session` row; the decision whether to adopt a library then is open.
