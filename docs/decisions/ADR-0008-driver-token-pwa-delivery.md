---
title: ADR-0008 Driver links, token exchange and the driver PWA as a separate app
description: How driver links are derived and stored as hashes, how the fragment token becomes an HttpOnly cookie, how the safety pass works, and why the driver PWA is its own Vite app under /d.
type: explanation
audience: [agent, developer]
tags: [adr, driver, pwa, security, gdpr, safety]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/domain-standards.md, docs/explanation/research/tech-architecture.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md]
---

# ADR-0008: Driver links, token exchange and the driver PWA as a separate app

Status: accepted, 2026-10-19. Revised 2026-10-19 after the design review: the booking poll is read-only, pass redemption moved to the briefings endpoint, and reschedules move the link expiry.

## Context

Drivers have no account. The scope fixes the link format `https://<host>/d#<token>`, 256 random bits, SHA-256 hashes only on the server, a POST exchange for an `HttpOnly; Secure; SameSite=Strict` cookie, exchange limited to 10 per minute per IP, `Referrer-Policy: no-referrer`, no third-party scripts, at most 150 KB gzip initial JavaScript, polling every 15 seconds, offline display of the last state, 12 languages, and a safety pass per tenant kept on the phone (DR-01 to DR-03, SF-04, CR-06).

Two requirements pull against each other. "The server stores SHA-256 hashes only" rules out keeping the raw token. "Booking detail offers copy" (CR-06) needs the link again later, not just once at creation.

## Options considered

**Token storage.**

| Option | Verdict |
|---|---|
| Random token, hash stored, link shown once | Satisfies hashing, fails CR-06: a carrier who closed the page must regenerate to copy, which revokes the link the driver already has. |
| Random token stored encrypted | The database holds recoverable tokens; a leaked key plus a dump reveals every link. Violates "hashes only". |
| **Token derived as HMAC-SHA256(`DRIVER_LINK_SECRET`, `driver_access.id`)** | The database stores `sha256(token)` only. The server recomputes the token for an authorized carrier or staff user on demand. A database dump alone reveals no link; regenerating creates a new row and revokes the old one. |

**Delivery.**

| Option | For | Against |
|---|---|---|
| Second Vite entry `d/index.html` in `apps/web` | One build, shared components | Shares the file-based router plugin, the service worker scope and the dependency graph with the back office. `apps/web` is owned by other work streams, so every driver change would touch their tree. |
| **Separate `apps/driver` Vite app with `base: '/d/'`** | Its own bundle budget, service worker scope `/d/`, manifest and i18n set. Disjoint file ownership. | A few shadcn components exist twice. Dev needs one more Vite server behind the proxy. |

## Decision

### Tokens

- `driver_access (id, tenant_id, booking_id, carrier_id, token_hash, channel, created_at, created_by, expires_at, revoked_at, last_used_at)`. `channel` is `link` (carrier or staff shares it) or `staff` (gate device, below).
- `token = base64url(HMAC-SHA256(DRIVER_LINK_SECRET, id))`, 256 bits. `token_hash = sha256(token)`, unique.
- One active `link` row per booking. Booking creation issues it; "Regenerate" (CR-06) revokes the current row and issues a new one.
- `GET .../bookings/:id/driver-link` recomputes the URL for users who may see the booking. The token never appears in a request line, only in responses to authorized users.
- Expiry: at creation `starts_at + 7 days`. A reschedule moves the active `link` row's `expires_at` to the new `starts_at + 7 days` in the same transaction, so a booking moved further out keeps a working link. Departure sets it to `min(departed_at + privacy.retention.driver_link_hours, starts_at + 7 days)`. `turned_away` does the same from the transition time. Cancellation revokes at once (BK-05).
- Rotating `DRIVER_LINK_SECRET` invalidates every link; that is the emergency revocation path.

### Exchange and session

1. The PWA reads `location.hash`, posts `{ token }` to `POST /api/public/driver-session`, and calls `history.replaceState(null, '', '/d')`. The exchange sits under `/api/public` because the driver scope middleware covers all of `/api/driver/*`.
2. The API applies the `driver_exchange` rate limit (10 per minute per IP, [ADR-0003](ADR-0003-authentication-self-built-sessions.md)), hashes the token, and reads the row under the `token` party.
3. Unknown, expired and revoked tokens all answer 401 `unauthorized`. The PWA shows one generic "This link is no longer valid" message (DR-01).
4. A valid token sets `rf_driver=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/driver; Max-Age=<seconds to expiry>`.
5. Every `/api/driver/*` request resolves the cookie the same way and runs under the `driver` party for that booking ([ADR-0002](ADR-0002-tenancy-isolation-rls.md)). The cookie holds the same token as the link; the exchange exists to move it out of the URL and out of JavaScript's reach.
6. Request logging records method, route pattern and status only. A test in U10 captures the log output of an exchange and asserts that neither the token nor the cookie appears.

### What the driver sees

`GET /api/driver/booking` returns a view model with no driver name, phone or plate (DR-01): tenant name and logo, site name, address and map link, slot instants with the site zone, booking code (the PWA draws the QR from the code, never from the token), status, dock and hall when called, safety status, and the privacy notice URL or `null` for the platform template. Polling runs every 15 seconds while `document.visibilityState` is `visible`, and immediately when the page becomes visible. The poll is read-only: it writes nothing, not even a safety link, so 2,000 open PWAs add reads only. Its safety status comes from `booking_acknowledgement`.

### Safety pass

- After an acknowledgement through channel `link`, the API sets `rf_device` (32 random bytes, `HttpOnly; Secure; SameSite=Strict; Path=/api/driver`, one year) if absent, and upserts `safety_pass (device_hash, tenant_id, instruction_id, acknowledgement_id, expires_at)`.
- When this phone opens another booking at the same tenant, `GET /api/driver/briefings` redeems valid passes: it links each still-valid acknowledgement to the new booking, and the briefing list and the booking view then show "valid until". The PWA calls it once per page load, right after the exchange and before the first booking poll, and again only when it opens the briefing screen. Redemption is an upsert on `(booking_id, instruction_id)`, so a repeated call changes nothing.
- Redemption reads acknowledgements beyond the current booking. It runs in `safety_pass.redeem.ts` inside the request transaction through `asScope` with a tenant scope and actor `system:safety_pass` ([ADR-0002](ADR-0002-tenancy-isolation-rls.md)), never as a second transaction.
- **Gate device.** "Start briefing on this device" (YD-02) issues a `driver_access` row with channel `staff`, 30 minutes, and opens `/d#<token>` in a new window. Acknowledgements get channel `staff`, and the API never sets `rf_device` or a pass for a `staff` session, so the next driver at the same tablet starts fresh.

### The app

- `apps/driver`: Vite 8, React 19, `base: '/d/'`, no router library (one screen state machine: invalid, booking, briefing, quiz), no TanStack Query (one polling hook), regular zod, i18next with the `driver` namespace in 12 locales. shadcn components are added with `shadcn add -c apps/driver`.
- `vite-plugin-pwa` with `generateSW`: precache the shell, fonts and pictograms; `NetworkFirst` with a 3-second timeout for `GET /api/driver/booking`. Offline, the PWA shows the last state with "as of HH:mm" (DR-03). The cached view always belongs to the booking of the current cookie, because both change only on a successful exchange. Opening a new link offline fails the exchange, and the PWA then says it is offline instead of showing the cached view of the previous booking. Check-in and acknowledgements need the network. The PWA never prompts for installation.
- Budget: `pnpm --filter @rampflow/driver size` builds and fails when initial JavaScript exceeds 150 KB gzip. The briefing and quiz screens load as a lazy chunk.
- Serving: in development `apps/web`'s Vite proxy forwards `/d` to the driver dev server on port 5174, so Playwright and the PWA use one origin. In production the API serves `apps/web/dist` at `/` and `apps/driver/dist` at `/d/` with `serveStatic`, and adds `Referrer-Policy: no-referrer` and `Content-Security-Policy: default-src 'self'; img-src 'self' data:; connect-src 'self'` to every `/d` response.

## Consequences

- A leaked database dump exposes no usable driver link. A leaked `DRIVER_LINK_SECRET` without the database exposes none either, because ids are unknown.
- Carriers can copy, email and share the link any number of times without invalidating it (CR-06).
- The driver app and the back office deploy as one origin but build and evolve separately. U10 owns `apps/driver` alone.
