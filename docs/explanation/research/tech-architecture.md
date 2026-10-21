---
title: Technical architecture research
description: Settles rampflow's open technical questions (versions, data access, tenancy isolation, auth, entitlements, settings, booking concurrency, i18n, PWA, testing, monorepo, email) with current best practice and pinned package versions as of 2026-10-19.
type: explanation
audience: [agent, developer]
tags: [research, architecture, tenancy, auth, entitlements, settings, testing, i18n]
status: stable
updated: 2026-10-21
---

# Technical architecture research

All versions below were read from the npm registry (`https://registry.npmjs.org/<pkg>`) on 2026-10-19. Local tooling is Node 24.20.0, pnpm 12.4.1, podman 5.7.0. The local images are `postgres:18.6`, `axllent/mailpit:v1.31.6` and `mcr.microsoft.com/playwright:v1.64.1-noble`.

The owner fixed the stack: Vite, Hono, PostgreSQL, zod, TanStack Router, TanStack Query, react-hook-form, date-fns, shadcn/ui and Tailwind. This document only fills the gaps around it.

## Decision summary

| # | Question | Recommendation | Packages (version) |
|---|---|---|---|
| 1a | Frontend build | Vite 8 (Rolldown) with plugin-react 6 and React 19 | `vite@8.3.4`, `@vitejs/plugin-react@6.1.2`, `react@19.3.1`, `react-dom@19.3.1` |
| 1b | Routing and server state | File-based routing through the Vite plugin. Query client goes into the router context. | `@tanstack/react-router@1.170.45`, `@tanstack/router-plugin@1.168.47`, `@tanstack/react-query@5.104.4` |
| 1c | API | Hono 4 on Node, `zValidator`, `hc` RPC client. Do not adopt Hono 5 while it is an RC. | `hono@4.13.13`, `@hono/node-server@2.1.5`, `@hono/zod-validator@0.9.1` |
| 1d | Validation and forms | Zod 4 from the root `zod` import. `zodResolver`. shadcn `Field` with `Controller`. | `zod@4.6.7`, `react-hook-form@7.90.0`, `@hookform/resolvers@6.0.0` |
| 1e | Dates | date-fns 4 with `@date-fns/tz` (`TZDate`, `tz()`), using the site time zone | `date-fns@4.4.0`, `@date-fns/tz@1.5.0` |
| 1f | Styling and UI | Tailwind v4 through the Vite plugin. shadcn CLI v4 with the Base UI default. Toast replaces Sonner, and Field replaces Form. | `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`, `shadcn@4.22.1` |
| 1g | Language | TypeScript 7 (native compiler). Note what it removes. | `typescript@7.0.2` |
| 2 | Data access | Drizzle ORM 0.45 stable with drizzle-kit and drizzle-zod on node-postgres. Avoid RQB v1 so the later v1 upgrade stays cheap. | `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`, `drizzle-zod@0.8.3`, `pg@8.23.1` |
| 3 | Tenancy isolation | Shared schema with explicit org columns, plus Postgres RLS as a backstop. Transaction-local `set_config` per request. Carrier policies key on `carrier_org_id`. | (Postgres 18) |
| 4 | Auth | better-auth core: email+password, sessions, verification, reset. Org model, memberships and invitations live in our own tables. Drivers get opaque hashed deep-link tokens. | `better-auth@1.7.11`, `@better-auth/drizzle-adapter@1.7.11` |
| 5 | Entitlements | Self-hosted entitlement catalog driven by module manifests in `packages/shared`. Packages are maps of entitlement values. Overrides are per tenant. | (own code) |
| 6 | Settings | One `setting_value` table (scope, key, jsonb) validated per key by zod from the manifests. Resolution order: site, tenant, platform, code default. | (own code) |
| 7 | Double booking | `EXCLUDE USING gist (dock_id WITH =, slot WITH &&) WHERE active` for docks. `SELECT … FOR UPDATE` on the pool row for pool capacity. | (`btree_gist`) |
| 8 | i18n | i18next with react-i18next. Lazy namespaces per module, selector-typed keys, and the same catalogs on the server for emails. | `i18next@26.5.2`, `react-i18next@17.1.0`, `i18next-resources-to-backend@1.2.3` |
| 9 | PWA | vite-plugin-pwa 2 in a separate small `apps/driver` Vite app. Precache the shell and use network-first for the booking read. | `vite-plugin-pwa@2.0.0`, `@vite-pwa/assets-generator@2.0.0` |
| 10 | Testing and linting | Vitest 5 against real Postgres, with a per-worker DB cloned from a migrated template DB. Playwright via the matching container. Biome for lint and format. | `vitest@5.0.5`, `@playwright/test@1.64.1`, `@biomejs/biome@2.5.15` |
| 11 | Monorepo | pnpm workspaces and catalogs. `apps/api`, `apps/web`, `apps/driver`, `packages/shared`, `packages/i18n`. Type-only import of `AppType`. | `pnpm@12` |
| 12 | Email | nodemailer SMTP to Mailpit in dev. React Email templates, localized through i18next. | `nodemailer@10.1.7`, `@react-email/components@1.0.12`, `@react-email/render@2.1.1` |

---

## 1. Versions and setup notes

### Vite and React

- **Vite 8** replaces the esbuild + Rollup pair with Rolldown as the single bundler and uses Oxc as the compiler. It needs Node 20.19+ or 22.12+. A compatibility layer translates existing `esbuild` and `rollupOptions` config. Vite 8 also adds built-in tsconfig `paths` support and forwards the browser console to the terminal.
- **`@vitejs/plugin-react@6`** requires Vite 8 and no longer depends on Babel. The `babel` option is gone. If we ever want the React Compiler, use `reactCompilerPreset()` with `@rolldown/plugin-babel`, or the experimental `react({ compiler: true })` with `oxc-transform-react`. Do not enable the compiler for the MVP.
- **React 19.3.1.**

### TanStack Router and Query

Install `@tanstack/react-router` and `@tanstack/router-plugin`. The plugin must come **before** `react()`:

```ts
// apps/web/vite.config.ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: { proxy: { "/api": "http://localhost:3000" } }, // same-origin cookies in dev
});
```

Pass `{ queryClient, auth }` as router context. Use `beforeLoad` for auth, entitlement and permission guards, and `loader` with `queryClient.ensureQueryData` for data. `@tanstack/react-query` is still v5 (5.104.4; `previous` tag = 4.x). The devtools packages are `@tanstack/react-router-devtools@1.167.2` and `@tanstack/react-query-devtools@5.104.4`.

### Hono

- `hono@4.13.13` is `latest`. `5.0.0-rc.1` (2026-10-10) is on `next` and has no published release notes. **Stay on 4.x** and plan the v5 upgrade after GA. `@hono/node-server@2.1.5` already accepts `hono ^4 || ^5`.
- `@hono/node-server` v2 needs Node ≥ 20, removed the Vercel adapter, and keeps the public API (`serve`, `serveStatic`). Since 2.1.5, `serveStatic` serves only GET and HEAD.
- **Validator:** Hono core has only a manual `validator`. Hono documents two middlewares: `@hono/zod-validator` (`zValidator`, peer `zod ^3.25 || ^4`) and `@hono/standard-validator@0.4.0` (`sValidator`, any Standard Schema). We are Zod-only, so use **`zValidator`**. Pass its third-argument hook so validation errors come back in one consistent JSON shape.
- **RPC (`hc`):** export `type AppType = typeof app` from the route chain. Both tsconfigs need `"strict": true`, and client and server must resolve the **same hono version**, or you get "Type instantiation is excessively deep". Return `c.json(body, status)` with explicit statuses so `InferResponseType<…, 200>` works. `c.notFound()` is not inferable. If tsserver slows down, use Hono's documented `hcWithType` pre-compiled client.

```ts
// apps/api/src/app.ts
const app = new Hono<AppEnv>()
  .basePath("/api")
  .route("/bookings", bookingRoutes)
  .route("/settings", settingsRoutes);
export type AppType = typeof app;

// apps/web/src/lib/api.ts
import { hc } from "hono/client";
import type { AppType } from "@rampflow/api/client"; // type-only, erased by Vite
export const api = hc<AppType>("/", { init: { credentials: "include" } });
```

### Zod 4

- The root `"zod"` import is Zod 4 (since 2025-07). `"zod/v4"` still works, and `"zod/v3"` exists for legacy code. Use `import * as z from "zod"` everywhere.
- **`zod/mini`** saves bundle size (about 4.0 kB vs 13.1 kB gzip for a small object schema) at the cost of a functional, less discoverable API. Zod's own docs recommend regular Zod unless bundle constraints are unusually strict. **Use regular Zod**, including in the driver PWA. Mixing the two would split the shared schemas.
- Compatibility: `@hono/zod-validator@0.9.1`, `@hookform/resolvers@6.0.0` and `drizzle-zod@0.8.3` all declare `zod ^3.25.0 || ^4.0.0`.

### react-hook-form and resolvers

- `react-hook-form@7.90.0` is `latest`. `8.0.0-beta.4` exists, so do not adopt v8 yet.
- `@hookform/resolvers@6.0.0` was published **today**. The only breaking change is in the Effect resolver (now Effect v4). The Zod resolver is unaffected. It needs `react-hook-form ^7.55.0`.
- Fields that use `.default()` or transforms have different input and output types. Type the form with three generics, as the resolver README shows: `useForm<z.input<typeof S>, unknown, z.output<typeof S>>({ resolver: zodResolver(S) })`.

### date-fns 4 and @date-fns/tz

Store every instant as `timestamptz` (UTC). Do all calendar math (slot grid, "today", cut-off times) in the **site's** IANA zone through the `in` option or `TZDate`:

```ts
import { TZDate, tz } from "@date-fns/tz";
import { addMinutes, startOfDay, isSameDay } from "date-fns";

const dayStart = startOfDay(new TZDate(dateIso, site.timeZone)); // local midnight at the site
const slots = Array.from({ length: 48 }, (_, i) => addMinutes(dayStart, i * 30));
isSameDay(a, b, { in: tz(site.timeZone) });
```

`tzScan(zone, { start, end })` finds DST transitions. Use it to make the slot grid skip or duplicate the right hour. Prefer `TZDateMini` internally because it is smaller. shadcn's Calendar accepts a `timeZone` prop; pass the site zone, not the browser zone.

### Tailwind v4 and shadcn

- Tailwind v4 needs no `tailwind.config.js`. Install with `pnpm add tailwindcss @tailwindcss/vite`, register the Vite plugin, and put `@import "tailwindcss";` in the CSS file.
- **shadcn CLI v4** (`shadcn@4.22.1`). `init` takes `-t vite` (template), `--preset <code>` (from shadcn/create), `--monorepo`, and `-b radix|base`. Since **July 2026, new projects default to Base UI**. Radix is still fully supported via `-b radix`. Since **September 2026**, components import `cn` from the standalone `cn` package (`cn@0.5.0`) instead of `lib/utils`.
- Current Vite flow for our monorepo: `pnpm dlx shadcn@latest init -t vite --monorepo`. For an existing app, run `pnpm dlx shadcn@latest init` in `apps/web` and then `pnpm dlx shadcn@latest add <component>`. In a monorepo, run `add` from the app directory or pass `-c apps/web`.
- **Recommendation: accept the Base UI default.** Both bases are "original shadcn". New components such as Toast ship first, or only, for Base UI, and the docs open on the Base UI tab.
- **Form changed.** The components index no longer lists `Form` (`FormField`, `FormItem`). The forms guide uses `useForm` + `<Controller>` + **`Field`**, `FieldLabel`, `FieldDescription` and `FieldError`, with `aria-invalid` and `data-invalid`. Build all forms this way.
- **Sonner changed.** The components index lists `Toast` (built on Base UI, July 2026), and the `/docs/components/sonner` URL now serves the Toast page. Use `toast`.
- Components the MVP needs, all in the official index: `sidebar`, `calendar`, `date-picker` (composition), `data-table` (a guide; it now uses **TanStack Table v9** `useTable`, `@tanstack/react-table@9.3.1`), `chart` (Recharts v3, `recharts@3.10.1`), `toast`, `field`, `input`, `input-group`, `select`, `native-select`, `combobox`, `command`, `dialog`, `sheet`, `drawer`, `dropdown-menu`, `tabs`, `badge`, `card`, `table`, `pagination`, `skeleton`, `spinner`, `empty`, `breadcrumb`, `tooltip`, `switch`, `checkbox`, `radio-group`, `alert`, `alert-dialog`, `kbd`, `item`, `button-group`, `input-otp`.

### TypeScript 7 gotchas

`typescript@7.0.2` (2026-07-08) is the Go-native compiler, roughly 10x faster. It has consequences for this stack:

- **No programmatic API** until 7.1. Tools that `require("typescript")` break; typescript-eslint is the important one (`typescript-eslint@8.71.2` peer `typescript <6.1.0`). The official workaround is `@typescript/typescript6@6.0.2` aliased as `typescript`. This is a main reason to choose Biome (section 10).
- **`baseUrl` is removed.** shadcn's Vite guide still tells you to add `baseUrl`. Use `paths` only (`"@/*": ["./src/*"]`, resolved relative to the tsconfig).
- `strict` is on by default and `module` defaults to `esnext`. **`types` defaults to `[]`**, so declare `"types": ["node"]` in the API and `"types": ["vite/client"]` in the web apps. `moduleResolution: node10` and `esModuleInterop: false` are rejected.

---

## 2. Data access: Drizzle vs Kysely vs postgres.js

| | Drizzle ORM | Kysely | postgres.js raw |
|---|---|---|---|
| Schema source | TS schema → generated SQL migrations (drizzle-kit) | DB → generated types (kysely-codegen), hand-written migrations | none |
| Zod integration | `drizzle-zod` (`createInsertSchema` / `createSelectSchema`), built in as `drizzle-orm/zod` in v1 | none built in | none |
| Type safety | full, schema-first | full, DB-first | tagged templates, manual types |
| RLS | `pgPolicy`, `pgRole`, `.withRLS()` declared in schema and migrated by drizzle-kit | raw SQL | raw SQL |
| better-auth adapter | first-party `@better-auth/drizzle-adapter` | Kysely is better-auth's built-in path | n/a |

**Recommendation: Drizzle**, for four reasons:

1. Schema, migrations and RLS policies live in one typed source of truth. `pgPolicy` keeps policies next to their tables in review.
2. `drizzle-zod` derives the row schemas that `packages/shared` refines into API contracts.
3. The `sql` template is always available for exclusion constraints, range queries and `set_config`.
4. better-auth has a first-party adapter for it.

**Version decision.** npm `latest` is `drizzle-orm@0.45.4` (2026-10-08) and `drizzle-kit@0.31.11`. **v1 is still a release candidate**: `rc` = `1.0.0-rc.4` (2026-06-27), with an `rc5` build on 2026-09-09. Drizzle's own "latest releases" page is stale and still shows v1 beta. Use **0.45.4 + drizzle-zod 0.8.3** now and keep the later move to v1 cheap:

- Use the core query builder (`db.select().from()…`) and avoid Relational Queries v1 (`db.query.x.findMany` with `relations()`). v1 requires migrating to RQB v2.
- When v1 goes GA: `pnpm add drizzle-orm@1 drizzle-kit@1`, run `drizzle-kit up` (it converts the migration folder: per-migration folders, no `journal.json`, DDL snapshots), and switch `drizzle-zod` imports to `drizzle-orm/zod`. `drizzle-kit drop` is removed in v1.
- better-auth's peer range (`drizzle-orm ^0.45.2 || >=1.0.0-rc.1`) already covers both.

**Driver:** `pg@8.23.1` (node-postgres, published 2026-09-30, Drizzle's default driver) rather than `postgres@3.4.9`. Write exclusion constraints, `btree_gist`, policies on raw-SQL tables and helper SQL functions as **custom migrations** (`drizzle-kit generate --custom`). Use Postgres 18 `uuidv7()` as the default for primary keys.

---

## 3. Multi-tenancy isolation

**Recommendation: shared schema with explicit org columns, plus RLS as defense in depth.** Application code always scopes queries itself (`where tenant_org_id = $1`), because that is readable and indexable. RLS is the backstop: a forgotten `where` returns zero rows instead of another tenant's data.

Why not app-level scoping only? This product has many access paths into the same table. A booking is visible to its tenant, to its carrier, and to its driver token. Each of those is a filter that someone will one day forget.

### Who sees what

| Actor (`app.party`) | Bookings visible | Write rule |
|---|---|---|
| `tenant` | `tenant_org_id = app.org_id()` | same, `WITH CHECK` |
| `carrier` | `carrier_org_id = app.org_id()`, across all tenants | insert only at tenants with an active `tenant_carrier_link` |
| `driver` | `id = app.booking_id()` | narrow update (check-in fields) via a `SECURITY DEFINER` function |
| `platform` | all, audited | only through the platform-admin module |

### Postgres mechanics

```sql
-- roles: rampflow_owner owns tables and runs migrations; rampflow_app is NOBYPASSRLS and owns nothing
create schema app;
create function app.org_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;
create function app.party() returns text language sql stable
  as $$ select current_setting('app.party', true) $$;
create function app.booking_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.booking_id', true), '')::uuid $$;

alter table booking enable row level security;
alter table booking force row level security;  -- owner is subject too

create policy booking_tenant on booking to rampflow_app
  using ((select app.party()) = 'tenant' and tenant_org_id = (select app.org_id()))
  with check ((select app.party()) = 'tenant' and tenant_org_id = (select app.org_id()));

create policy booking_carrier_read on booking for select to rampflow_app
  using ((select app.party()) = 'carrier' and carrier_org_id = (select app.org_id()));

create policy booking_carrier_insert on booking for insert to rampflow_app
  with check ((select app.party()) = 'carrier'
    and carrier_org_id = (select app.org_id())
    and exists (select 1 from tenant_carrier_link l
                where l.tenant_org_id = booking.tenant_org_id
                  and l.carrier_org_id = booking.carrier_org_id and l.active));

create policy booking_platform on booking to rampflow_app
  using ((select app.party()) = 'platform');
```

Key facts from the Postgres docs:

- Superusers and `BYPASSRLS` roles always bypass RLS.
- Table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set.
- With RLS enabled and no policy, access is default-deny.
- Permissive policies combine with OR; restrictive ones with AND.
- Referential-integrity checks bypass RLS.
- Unset settings: `current_setting(name, true)` returns NULL, and NULL comparisons fail closed.

Wrap the function calls in `(select …)` so the planner evaluates them once per query, and index every `*_org_id` column.

Carrier-visible tables that join to tenant data, such as dock names and site addresses for their bookings, need their own carrier `select` policies. Expose them through narrow views or `SECURITY DEFINER` functions, not blanket read access.

### Request-scoped transaction helper (Hono + Drizzle)

`set_config(..., true)` is **transaction-local**, so it is safe with connection pools and PgBouncer transaction mode. Every request that touches tenant data runs inside exactly one scoped transaction.

```ts
// apps/api/src/db/scope.ts
export type Scope =
  | { party: "tenant" | "carrier"; userId: string; orgId: string }
  | { party: "platform"; userId: string }
  | { party: "driver"; bookingId: string };

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function withScope<T>(scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.party', ${scope.party}, true),
      set_config('app.user_id', ${"userId" in scope ? scope.userId : ""}, true),
      set_config('app.org_id', ${"orgId" in scope ? scope.orgId : ""}, true),
      set_config('app.booking_id', ${"bookingId" in scope ? scope.bookingId : ""}, true)`);
    return fn(tx);
  });
}

// Hono middleware: resolve scope once, then handlers use c.var.tx(...)
export const scoped = createMiddleware<AppEnv>(async (c, next) => {
  const scope = await resolveScope(c); // session + X-Org-Id header checked against memberships
  c.set("scope", scope);
  c.set("tx", <T>(fn: (tx: Tx) => Promise<T>) => withScope(scope, fn));
  await next();
});
```

Rules that make this hold:

- The app connects as `rampflow_app` (NOBYPASSRLS, not the table owner). Migrations run as `rampflow_owner`.
- The active org comes from the URL or a header, and **the server checks it against the user's memberships**. Never trust the client value.
- Auth tables (user, session, account, verification) and the global catalogs have no tenant RLS. Only the auth module touches them.
- Write a CI "leak test": for each repository read function, seed two tenants, call it under tenant B's scope with tenant A's IDs, and expect empty results.

---

## 4. Auth

Requirements:

- Email+password for tenant, carrier and platform users
- Invitations
- Multiple org memberships with roles
- Driver access without an account

| Option | For | Against |
|---|---|---|
| **better-auth** (`1.7.11`) | Password hashing (scrypt), DB sessions, email verification, password reset, session revocation and rate limiting are done. First-party Drizzle adapter. Hono integration is a single route. SSO, 2FA and passkeys are later plugins, which matters because warehouse enterprises often ask for Entra ID SSO. | High advisory cadence. In 2026, GitHub lists 10 advisories on the first page alone, including a critical "OAuth state can be used as a Magic Link" (2026-09-30) and a high "Attacker's password keeps working after magic link or email OTP sign-in" (2026-06-26). Most are in plugins (SSO, SCIM, OAuth proxy, magic link, stripe). The organization plugin's model (comma-separated roles, no org type, no site scope) does not match our party model. |
| Self-built (session cookie, `@node-rs/argon2@2.2.2`, Postgres sessions) | Total control, small attack surface, maps exactly onto our party model and RLS | We would build and own reset, verification, rate limiting, session rotation, CSRF/origin checks and later SSO. Each is a classic place for security bugs. |
| Hosted IdP (Auth0, Clerk, WorkOS) | Least code | Per-MAU cost on non-paying carriers and drivers. Data residency. An external dependency in a B2B logistics product. |

**Recommendation: better-auth for identity only. Our own tables for the tenancy model.**

- Enable `emailAndPassword` with `requireEmailVerification: true` and `revokeSessionsOnPasswordReset: true`, plus `sendResetPassword` and verification emails. Use `@better-auth/drizzle-adapter` with `provider: "pg"` and `advanced.database.generateId: "uuid"`. Mount it with `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))` before the catch-all route. Load the session in a middleware with `auth.api.getSession({ headers: c.req.raw.headers })`. Keep the SPA same-origin with the API (Vite proxy in dev, one origin in prod) so no CORS or cross-site cookie setup is needed.
- **Do not enable** the organization, magic-link, oauth-proxy or SCIM plugins for the MVP. Most of the 2026 advisories are in those plugins.
- **Own tables:**
  - `org (id, kind: 'platform'|'tenant'|'carrier', …)`
  - `membership (user_id, org_id, role, site_ids uuid[] null)`. Site scoping is for gate and dock operators.
  - `invitation (id, org_id, email, role, token_hash, expires_at, accepted_at)`
  - `tenant_carrier_link`

  Invitation acceptance is our own endpoint. It verifies the token, then either attaches the membership to the signed-in user or calls `auth.api.signUpEmail` server-side and marks the email verified, because the token proves the mailbox. **Block public sign-up** at the Hono layer, except carrier self-registration if product wants it. That closes the pre-registration takeover class of bug.
- Roles map to permission keys declared by module manifests (section 5). Each request resolves `{ party, orgId, role, siteIds }` into a permission set.
- Pin exact versions, subscribe to `github.com/better-auth/better-auth/security/advisories`, and treat a better-auth bump like a security patch.

### Driver deep links

Use opaque tokens, not JWTs, because a driver link must be revocable when a booking is cancelled or reassigned.

```ts
const raw = randomBytes(32).toString("base64url");          // goes in the SMS/email link
await tx.insert(driverAccess).values({
  bookingId, tokenHash: sha256(raw), scope: ["booking:read", "booking:checkin", "safety:ack"],
  expiresAt: addHours(booking.slotEnd, 12),
});
// https://driver.rampflow.app/d/<raw>
```

When the driver opens `/d/:token`, the API hashes the token, looks it up, checks expiry and revocation, and sets a short-lived httpOnly `driver_session` cookie bound to that row. The PWA then removes the token from the URL with `history.replaceState`.

Driver requests run under `withScope({ party: "driver", bookingId })`, so RLS limits them to one booking. Rate-limit the lookup endpoint and log every use.

---

## 5. Entitlements

### What the vendors do

- **Stripe Entitlements:** a `Feature` with a unique `lookup_key` is attached to Products (`ProductFeature`). Stripe keeps `ActiveEntitlement`s per customer and fires `entitlements.active_entitlement_summary.updated` when they change; the summary payload holds at most 10 entries, beyond that you page through `entitlements.url`. Features are **boolean only**, with no numeric limits. Stripe recommends keeping its entitlements in your own system for fast checks.
- **Schematic:** boolean, event-based (metered) and trait-based (e.g. seats) entitlements. Plan entitlements merge with company overrides, and **the more generous value wins**. Overrides can expire.
- **Lago:** a Feature has typed **privileges** (boolean, integer, string, select). Values are set per plan, and per-subscription overrides replace them for one customer only.
- **Orb:** usage-based billing. Its public docs mention credits for "trials, access control" but no feature-entitlement API.
- **OpenFeature:** a vendor-neutral **feature-flag** evaluation API (providers, evaluation context, hooks). It is not a billing or entitlement model. It could later wrap our resolver as a provider for rollout flags, but it should not be the source of truth for what a tenant paid for.

**Takeaway:** every system converges on three things. A catalog of keyed features with typed values, plans that are sets of values, and per-customer overrides that resolve to an effective map, cached locally. Billing is not in scope yet, so **build the catalog in code**. A billing system can drive plan assignment later. For example, Stripe `lookup_key`s can equal our package IDs, and the webhook sets `tenant_subscription.package_id`.

### Shared module manifest

```ts
// packages/shared/src/modules/define.ts
import * as z from "zod";

export type PartyKind = "platform" | "tenant" | "carrier" | "driver";
export type SettingScope = "platform" | "tenant" | "site";

export type EntitlementDef =
  | { kind: "feature"; description: string }
  | { kind: "limit"; description: string; unit: "count"; default: number }; // -1 = unlimited

export interface PermissionDef { description: string; parties: readonly PartyKind[] }

export interface SettingDef<S extends z.ZodType = z.ZodType> {
  schema: S;
  default: z.output<S>;
  scopes: readonly SettingScope[];      // where an override is allowed
  requires?: string;                     // entitlement key that must be on
  sensitive?: boolean;                   // never sent to the browser
}

export interface NavItem {
  id: string;
  labelKey: string;                      // i18n key in the module namespace
  to: string;                            // TanStack Router path, e.g. "/t/$orgId/bookings"
  icon: string;                          // lucide icon name
  parties: readonly PartyKind[];
  requires?: { entitlement?: string; permission?: string };
}

export interface ModuleManifest {
  id: string;                            // "booking"
  dependsOn?: readonly string[];         // ["masterdata"]
  i18nNamespace: string;                 // lazy-loaded namespace = module id
  entitlements: Record<string, EntitlementDef>;   // keys are "<module>.<name>"
  permissions: Record<string, PermissionDef>;     // keys are "<module>.<verb>"
  settings: Record<string, SettingDef>;            // keys are "<module>.<name>"
  nav: readonly NavItem[];
}

export const defineModule = <const M extends ModuleManifest>(m: M) => m;
```

```ts
// packages/shared/src/modules/booking.ts
export const bookingModule = defineModule({
  id: "booking",
  dependsOn: ["masterdata"],
  i18nNamespace: "booking",
  entitlements: {
    "booking.enabled":        { kind: "feature", description: "Slot booking" },
    "booking.carrier_portal": { kind: "feature", description: "Carriers book themselves" },
    "booking.max_docks":      { kind: "limit", unit: "count", default: 5, description: "Bookable docks" },
  },
  permissions: {
    "booking.read":   { description: "View bookings", parties: ["tenant", "carrier"] },
    "booking.create": { description: "Create bookings", parties: ["tenant", "carrier"] },
    "booking.manage": { description: "Change any booking", parties: ["tenant"] },
  },
  settings: {
    "booking.slot_minutes":      { schema: z.number().int().min(5).max(240), default: 30, scopes: ["platform", "tenant", "site"] },
    "booking.cancel_cutoff_hours": { schema: z.number().int().min(0).max(168), default: 24, scopes: ["platform", "tenant", "site"] },
  },
  nav: [{ id: "bookings", labelKey: "nav.bookings", to: "/t/$orgId/bookings", icon: "calendar-clock",
          parties: ["tenant", "carrier"], requires: { entitlement: "booking.enabled", permission: "booking.read" } }],
});

// packages/shared/src/modules/index.ts
export const modules = [masterdataModule, bookingModule, avisModule, safetyModule, yardModule, platformModule] as const;
type AllEntitlements = (typeof modules)[number]["entitlements"];
export type EntitlementKey = { [K in keyof AllEntitlements]: K }[keyof AllEntitlements] & string; // union of all keys
export type EntitlementValues = Partial<Record<EntitlementKey, boolean | number>>;

export const packages = {
  dock_basic: { "booking.enabled": true, "booking.max_docks": 10, "masterdata.enabled": true },
  dock_pro:   { "booking.enabled": true, "booking.carrier_portal": true, "booking.max_docks": -1,
                "avis.enabled": true, "safety.enabled": true, "yard.enabled": true, "masterdata.enabled": true },
} satisfies Record<string, EntitlementValues>;
```

### Resolution

`effective = catalog defaults ← package values ← add-ons (feature OR, limit max) ← tenant overrides`.

Tenant overrides are **explicit** (they can lower a limit too) and carry `expires_at`. Unlike Schematic's "most generous wins", sales needs to be able to restrict as well as grant. Disable a module automatically if a `dependsOn` module is off.

The resolved map is computed per tenant and cached in memory with a version stamp. Bump the stamp on subscription or override writes; a `LISTEN/NOTIFY` message invalidates other API instances.

A startup check verifies that every key referenced by packages, nav items and `requires` exists in the catalog. CI fails on unknown keys.

### Enforcement

- **API:** `requireEntitlement("booking.enabled")` and `requirePermission("booking.create")` Hono middlewares on each route group. **Limits** are checked inside the write transaction, e.g. `count(docks) < limit` while holding the tenant row `FOR UPDATE`, because a middleware check cannot see concurrent writes.
- **Carrier context:** a carrier acting at tenant X is governed by **X's** entitlements (`booking.carrier_portal`). Carriers have no package of their own.
- **UI:** `GET /api/me/context?org=…` returns `{ party, org, role, permissions[], entitlements, settings }`. TanStack Router `beforeLoad` redirects on missing keys. A `useCan()` hook hides actions. The sidebar is `modules.flatMap(m => m.nav).filter(visible)`. The UI hides; only the API enforces.

---

## 6. Hierarchical typed settings

**Recommendation: one generic table, validated per key from the manifests.** Typed columns would mean a migration per setting and three copies of each column (platform, tenant, site). Use typed columns only for **structural attributes** that other queries filter or join on, such as `site.time_zone`, `site.country` and `site.default_locale`. Those are master data, not settings.

```sql
create table setting_value (
  scope_type   text not null check (scope_type in ('platform','tenant','site')),
  scope_id     uuid not null,                 -- platform row uses a fixed nil uuid
  tenant_org_id uuid,                         -- null for platform; drives RLS
  key          text not null,
  value        jsonb not null,
  updated_by   uuid not null,
  updated_at   timestamptz not null default now(),
  primary key (scope_type, scope_id, key)
);
```

**Write path:**

1. Look up the `SettingDef` from the manifest registry.
2. Reject the write if the scope is not in `scopes` or the required entitlement is off.
3. Validate the value with `def.schema.parse(value)` and store it.
4. Write an audit row.

Deleting the row means "inherit".

**Read path (resolution):**

- One query fetches all rows for `(platform, nil)`, `(tenant, orgId)` and `(site, siteId)`.
- Then, per key, take the most specific scope that parses: site, then tenant, then platform, then the code default.
- If a stored value no longer parses after a schema change, log it and fall through to the next level, so the app never crashes on a stale value.
- Return provenance alongside the value:

```ts
type Resolved<T> = { value: T; source: "site" | "tenant" | "platform" | "default"; inherited: { value: T; source: string } | null };
```

**UI:** each settings field shows the effective value and, as quiet text, where it comes from: "Product default", "From platform", "From tenant" or "Set for this site". An overridden field also shows the value it would inherit and offers "Use inherited value", a pending change that the topic's one `PATCH` saves together with the other edits. ADR-0020 records the topic pages, deep links and search built on this.

An optional `lockedAt: "tenant"` flag lets a tenant forbid site overrides. That is the common "corporate policy" request.

Settings flagged `sensitive` stay server-only. The UI receives the resolved map for the current site from `/api/me/context`.

---

## 7. Double-booking prevention

### Single dock: exclusion constraint

```sql
create extension if not exists btree_gist;

alter table booking
  add column slot tstzrange not null,          -- '[start,end)' in UTC
  add constraint booking_no_overlap
    exclude using gist (dock_id with =, slot with &&)
    where (status in ('requested','confirmed','arrived','docked'));
```

- Postgres rejects the second overlapping insert with SQLSTATE `23P01`. Map it to HTTP 409 "slot taken".
- Rows with `dock_id IS NULL` never conflict, because `NULL = NULL` is not true. Unassigned pool bookings therefore coexist until a dock is assigned.
- Postgres 18 also supports `UNIQUE (dock_id, slot WITHOUT OVERLAPS)`, which behaves like the same EXCLUDE. UNIQUE constraints cannot have a `WHERE` clause, though, and cancelled bookings must not block. So **use EXCLUDE with the partial predicate**.
- Also add `check (not isempty(slot))` and `check (lower(slot) < upper(slot))`.

### Dock pool: capacity

A pool booking reserves "one of N docks" without picking a dock, which an exclusion constraint cannot express.

| Option | Verdict |
|---|---|
| `SERIALIZABLE` transaction, count, insert | Correct, but every caller needs a retry loop on `40001`, and predicate locks give false-positive aborts. |
| Advisory lock `pg_advisory_xact_lock(hash(pool_id))` | Works and is transaction-scoped, but the lock key is invisible in the schema and hashing can collide. Session-level advisory locks leak through pools. |
| **`SELECT … FOR UPDATE` on the pool row** | **Recommended.** It serializes bookings per pool, holds only for milliseconds, and the contention at our scale (bookings per pool per second ≪ 1) is irrelevant. It is visible in code and needs no retries. |

```ts
await c.var.tx(async (tx) => {
  await tx.execute(sql`select 1 from dock_pool where id = ${poolId} for update`);
  const [{ peak }] = await tx.execute(sql`
    select coalesce(max(cnt), 0) as peak from (
      select count(*) as cnt
      from generate_series(${start}::timestamptz, ${end}::timestamptz - interval '1 minute', ${grid}::interval) g(t)
      join booking b on b.pool_id = ${poolId} and b.status in ('requested','confirmed','arrived','docked')
                    and b.slot @> g.t
      group by g.t) s`);
  if (peak >= capacity) throw new SlotFull();
  await tx.insert(booking).values({ poolId, slot: range(start, end), /* … */ });
});
```

- `capacity` is the number of active docks in the pool, adjusted for blocked or maintenance windows.
- A **direct** booking on a dock that belongs to a pool must take the same pool lock, so both paths see each other.
- Assigning a pool booking to a concrete dock at arrival sets `dock_id`, and the exclusion constraint then guards that dock.
- Always lock in a fixed order (pool row, then tenant row if limits apply) to avoid deadlocks.

---

## 8. i18n

| | react-i18next 17 / i18next 26 | Lingui 6 | Paraglide JS 2 |
|---|---|---|---|
| Type safety | Keys and interpolation via `CustomTypeOptions`; selector API `t($ => $.booking.title)` with `enableSelector: "optimize"` avoids type-check blowups; `ResourceNamespaceMap` for monorepos | macro-extracted IDs; ICU | compiled typed functions `m.key(params)` |
| Bundle | Runtime plus JSON; no per-message tree-shaking | Small runtime, compiled catalogs | Smallest; its benchmark shows 47 kB vs 205 kB for i18next |
| Lazy namespaces | Yes (`i18next-resources-to-backend`) | Per-locale catalogs | Not documented; `setLocale()` reloads the page |
| Plurals | `_one`/`_other` with `Intl.PluralRules`; ICU via `i18next-icu@2.6.1` | ICU MessageFormat | Variants with `Intl.PluralRules`; ICU1 via plugin |
| Build coupling | none | Needs a Babel or SWC macro plugin. plugin-react 6 dropped Babel, so this means adding `@rolldown/plugin-babel` back. | Compiler step; emitting TS declarations needs TS ≥ 5.6 (risky with TS 7's missing API, unverified) |
| Server use | `createInstance()` per message | yes | `paraglideMiddleware` with AsyncLocalStorage |

**Recommendation: i18next + react-i18next**, for four reasons:

1. **Namespaces map 1:1 to modules** (manifest `i18nNamespace`), so each module's strings load lazily with its routes.
2. Language switches without a reload. That matters to gate operators who switch language for a driver standing at the window.
3. No compiler or Babel coupling, so it is unaffected by TS 7 and Vite 8 changes.
4. The same JSON catalogs serve email rendering on the server.

Paraglide is the runner-up if driver-PWA bundle size ever dominates. Use i18next's native plural format and add `i18next-icu` only if translators demand ICU.

Setup:

- `packages/i18n/locales/<lng>/<ns>.json`, with `de` and `en` first.
- Configure `enableSelector: "optimize"` and declare `resources` from the English catalogs.
- Load lazily with `resourcesToBackend((lng, ns) => import(\`../locales/${lng}/${ns}.json\`))`.
- Detect the language with `i18next-browser-languagedetector@8.2.1`, overridden by the user's profile locale.
- Format numbers and dates with `Intl` and date-fns locales. **The display time zone is always the site's**, with the zone abbreviation shown when it differs from the browser's.

**Server-side localization:** every user and driver-access row stores `locale`. Notifications render with `i18next.createInstance()` initialized from the same catalogs, keyed by the recipient's locale (falling back to the site default locale, then `en`). Times in emails are formatted in the site zone with an explicit zone label. Never use the server's TZ.

---

## 9. PWA for drivers

- `vite-plugin-pwa@2.0.0` (2026-10-03), with peer `vite ^3…^8`, `workbox-build ^7.4.1` and `@vite-pwa/assets-generator ^1 || ^2`. The 2.0 release notes only flag the assets-generator peer bump.
- Minimal config is `VitePWA({ registerType: "autoUpdate" })`, which generates the manifest, the service worker and registration. `devOptions.enabled` turns it on in dev.

**Recommendation: a separate `apps/driver` Vite app** sharing `packages/shared`, `packages/i18n` and the shadcn UI package. The driver bundle carries no admin code, the service worker scope and update cycle stay independent of the back-office app, and the manifest `start_url`/`scope` can be `/d/`.

Offline needs are modest:

- Precache the app shell, fonts and icons.
- Use **NetworkFirst** for `GET /api/driver/booking`, so the last known slot, dock, gate instructions and safety briefing show in a dead zone, with "last updated" visible.
- Run check-in and safety acknowledgement online only, with a clear retry UI. Background Sync is unreliable on iOS, and gate operators need real-time state anyway.
- Installability is optional. Drivers arrive through a one-time link, so do not push an install prompt. The manifest and icons, generated by `@vite-pwa/assets-generator@2.0.0`, still make "Add to Home Screen" work for repeat drivers.
- Use `registerType: "autoUpdate"` so a fixed bug reaches drivers on the next open.

---

## 10. Testing, lint and format

### Vitest 5 with real Postgres

`vitest@5.0.5` (2026-09-03 release post) requires **Node ≥ 22.12 and Vite ≥ 6.4**. Breaking changes that affect us:

- `VITEST_POOL_ID` and `VITEST_WORKER_ID` are now **1-based**.
- Inline projects inherit the root config.
- `clearMocks` defaults to true.
- Unawaited `resolves`/`rejects` fail the test.
- Reporter output goes to `.vitest/`.
- `test.sequential` was removed.

**Pattern: template DB, cloned per worker.**

1. A `globalSetup` connects to the compose Postgres (`postgres:18.6`, tmpfs data dir, `fsync=off`). It drops and recreates `rampflow_tpl`, runs Drizzle migrations into it as `rampflow_owner`, then disconnects. CREATE DATABASE … TEMPLATE fails if any session is connected to the source.
2. A setup file creates `rampflow_test_${VITEST_POOL_ID}` with `TEMPLATE rampflow_tpl`, but only if it does not already exist for this run. Each worker gets a migrated DB in milliseconds.
3. **Isolation inside a worker comes from tenancy, not rollback.** Each test creates its own tenant and carrier through factory helpers with fresh UUIDs, so tests cannot see each other's rows. This also exercises the real `withScope` transactions and RLS. A rollback wrapper would hide commit-time behavior: deferred constraints, and exclusion conflicts between two concurrent transactions.
4. Concurrency tests (double booking) open two real connections and race them with `Promise.all`.

`@testcontainers/postgresql@12.2.1` is possible, but with podman it needs the Docker-compatible socket configured. The compose service is simpler because it already exists.

### Playwright

`@playwright/test@1.64.1` matches the local image `mcr.microsoft.com/playwright:v1.64.1-noble`, and the versions **must match**, or the client cannot find browser executables. Run the browser server in the container:

```sh
podman run --rm --init --ipc=host -p 3001:3000 --add-host=hostmachine:host-gateway \
  --user pwuser --workdir /home/pwuser mcr.microsoft.com/playwright:v1.64.1-noble \
  /bin/sh -c "npx -y playwright@1.64.1 run-server --port 3000 --host 0.0.0.0"
PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3001/ pnpm exec playwright test
```

Use `baseURL: "http://hostmachine:5173"` from inside the container. E2E journeys read invitation and driver-link emails through the Mailpit REST API: `GET /api/v1/search?query=to:x@example.com`, `GET /api/v1/message/{ID}` (or `latest`), `GET /view/{ID}.html`, and `DELETE /api/v1/messages` between specs.

### Biome vs ESLint + Prettier

**Biome 2.5.15**, for three reasons:

1. **TS 7 has no compiler API**, and typescript-eslint 8.71 declares `typescript <6.1.0`. Type-aware ESLint would need the `@typescript/typescript6` alias next to TS 7.
2. Biome does not depend on `typescript` at all and has its own type inference for rules like `noFloatingPromises`.
3. One fast tool covers lint and format.

Caveats:

- `noFloatingPromises` and `useSortedClasses` (Tailwind class sorting) are **nursery** rules. Enable them explicitly and expect changes.
- `useSortedClasses` reads no Tailwind config.
- Biome 2.5 deprecates the `recommended` option in favor of `preset`; run `biome migrate --write`.

Type checking is `tsc -b` (TS 7) in CI.

---

## 11. Monorepo layout

```
rampflow/
  pnpm-workspace.yaml        # packages: apps/*, packages/*; catalog: pinned versions
  tsconfig.base.json         # strict, target es2024, module esnext, verbatimModuleSyntax, isolatedModules
  biome.json
  compose.yaml               # postgres:18.6, postgres-test (tmpfs), mailpit
  apps/
    api/      # Hono + better-auth + drizzle; exports "./client" -> src/client.ts (types only)
    web/      # back-office SPA (tenant, carrier, gate/dock, platform admin)
    driver/   # driver PWA
  packages/
    shared/   # zod contracts, module manifests, entitlement/permission/setting keys, packages
    i18n/     # locales/<lng>/<ns>.json + i18next init helpers (browser and server)
    ui/       # shadcn components (shadcn --monorepo convention, imported as @workspace/ui)
  e2e/        # Playwright specs
```

- **Catalogs:** put every shared dependency (`hono`, `zod`, `react`, `@tanstack/*`, `typescript`) in the `catalog:` section of `pnpm-workspace.yaml` and reference it as `"hono": "catalog:"`. This guarantees one hono version across api and web, which the RPC types require. Use `catalogMode: strict` so `pnpm add` cannot drift.
- pnpm ≥ 10 blocks dependency build scripts by default. Allow-list them with `allowBuilds` in `pnpm-workspace.yaml` only if needed. `@node-rs/argon2` ships prebuilt binaries.
- **TS config:** `tsconfig.base.json` holds shared strict options.
  - `apps/web` and `apps/driver` use `moduleResolution: "bundler"` and `types: ["vite/client"]`.
  - `apps/api` uses `module/moduleResolution: "nodenext"` and `types: ["node"]`.
  - `packages/*` are **source-only internal packages**: `exports` point at `./src/*.ts`, there is no build step, Vite compiles them for the web, and `tsx@4.23.15` runs the API in dev.
  - Use project references (`composite: true`) so `tsc -b` checks everything incrementally.
- **Sharing Hono RPC types without bundling server code:** `apps/api/src/client.ts` does `export type { AppType } from "./app"`, and `apps/api/package.json` exports `"./client": { "types": "./src/client.ts" }`. `apps/web` adds `@rampflow/api: "workspace:*"` as a **devDependency** and imports it only with `import type` (enforced by `verbatimModuleSyntax`), so Vite erases it and no server module reaches the browser graph. Both sides need `strict: true`. If editor latency grows with route count, switch to Hono's `hcWithType` pattern (the client type is compiled in the API package) or split clients per module.
- **Rule:** `packages/shared` must never import server-only code (drizzle, pg, better-auth). Zod schemas there are refined from plain shapes, and the API maps drizzle-zod output onto them. A Biome `noRestrictedImports` rule enforces this.

---

## 12. Email in dev

**Recommendation: nodemailer SMTP everywhere. Mailpit in dev and E2E. Any SMTP relay or provider in prod.**

- `nodemailer@10.1.7`. v10 needs Node ≥ 20 and was rewritten in TypeScript with ESM and CJS builds. v9 made TLS certificate validation the default for remote content and OAuth endpoints.
- Mailpit: SMTP on `1025`, UI and API on `8025`. Compose env: `MP_SMTP_AUTH_ACCEPT_ANY=1`, `MP_SMTP_AUTH_ALLOW_INSECURE=1`, `MP_MAX_MESSAGES=5000`.
- Templates: React Email (`@react-email/components@1.0.12`, `@react-email/render@2.1.1`). Components get a server-side i18next `t` and the site time zone as props. Render HTML and plain-text parts.
- Send through a transactional **outbox** table. Insert the email row inside the business transaction, and a worker delivers it. That way a rolled-back booking never sends "confirmed". `pg-boss@12.38.0` (Postgres-backed queue, no Redis) can run the worker and retries once there is more than one job type.

---

## Sources

All URLs below were fetched on 2026-10-19.

- npm registry, `https://registry.npmjs.org/<package>` and `/<package>/latest`, for every version in this document
- Vite 8 announcement: https://vite.dev/blog/announcing-vite8
- plugin-react changelog: https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md
- TanStack Router with Vite: https://tanstack.com/router/latest/docs/framework/react/installation/with-vite
- TanStack Query overview: https://tanstack.com/query/latest/docs/framework/react/overview
- Hono validation: https://hono.dev/docs/guides/validation
- Hono RPC: https://hono.dev/docs/guides/rpc
- Hono releases: https://github.com/honojs/hono/releases
- @hono/node-server releases: https://github.com/honojs/node-server/releases and https://github.com/honojs/node-server/releases/tag/v2.0.0
- Zod versioning: https://zod.dev/v4/versioning
- Zod Mini: https://zod.dev/packages/mini
- hookform resolvers: https://github.com/react-hook-form/resolvers and https://github.com/react-hook-form/resolvers/releases
- @date-fns/tz: https://github.com/date-fns/tz
- Tailwind with Vite: https://tailwindcss.com/docs/installation/using-vite
- shadcn Vite install: https://ui.shadcn.com/docs/installation/vite
- shadcn components: https://ui.shadcn.com/docs/components
- shadcn forms: https://ui.shadcn.com/docs/forms/react-hook-form
- shadcn Toast: https://ui.shadcn.com/docs/components/toast and https://ui.shadcn.com/docs/components/sonner
- shadcn data table: https://ui.shadcn.com/docs/components/data-table
- shadcn calendar: https://ui.shadcn.com/docs/components/calendar
- shadcn chart: https://ui.shadcn.com/docs/components/chart
- shadcn changelog: https://ui.shadcn.com/docs/changelog, https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default, https://ui.shadcn.com/docs/changelog/2026-07-toast, https://ui.shadcn.com/docs/changelog/2026-03-cli-v4
- TypeScript 7.0 announcement: https://devblogs.microsoft.com/typescript/?p=5246
- Drizzle: https://orm.drizzle.team/docs/zod, https://orm.drizzle.team/docs/rls, https://orm.drizzle.team/docs/upgrade-v1, https://orm.drizzle.team/docs/latest-releases (stale)
- better-auth: https://www.better-auth.com/docs/plugins/organization, https://www.better-auth.com/docs/integrations/hono, https://www.better-auth.com/docs/adapters/drizzle, https://www.better-auth.com/docs/authentication/email-password, https://www.better-auth.com/docs/concepts/database
- better-auth advisories: https://github.com/better-auth/better-auth/security/advisories
- Stripe Entitlements: https://docs.stripe.com/billing/entitlements.md?dashboard-or-api=api
- Schematic overrides: https://docs.schematichq.com/feature_management/overrides
- Lago entitlements: https://getlago.com/docs/guide/entitlements
- Orb docs: https://docs.withorb.com/
- OpenFeature: https://openfeature.dev/docs/reference/intro
- PostgreSQL docs:
  - https://www.postgresql.org/docs/current/rangetypes.html
  - https://www.postgresql.org/docs/current/sql-createtable.html
  - https://www.postgresql.org/docs/current/ddl-rowsecurity.html
  - https://www.postgresql.org/docs/current/explicit-locking.html
  - https://www.postgresql.org/docs/current/functions-admin.html
  - https://www.postgresql.org/docs/current/functions-uuid.html
  - https://www.postgresql.org/docs/current/manage-ag-templatedbs.html
- i18next TypeScript: https://www.i18next.com/overview/typescript
- Lingui v6 migration: https://lingui.dev/releases/migration-6
- Paraglide JS: https://paraglidejs.com/
- vite-plugin-pwa: https://vite-pwa-org.netlify.app/guide/ and https://github.com/vite-pwa/vite-plugin-pwa/releases
- Vitest: https://vitest.dev/blog/, https://vitest.dev/blog/vitest-5, https://vitest.dev/guide/migration/, https://vitest.dev/config/globalsetup, https://vitest.dev/guide/parallelism
- Playwright Docker: https://playwright.dev/docs/docker
- Biome: https://biomejs.dev/blog/, https://biomejs.dev/blog/biome-v2-5/, https://biomejs.dev/linter/rules/no-floating-promises/, https://biomejs.dev/linter/rules/use-sorted-classes/
- pnpm: https://pnpm.io/catalogs and https://pnpm.io/settings
- nodemailer changelog: https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md
- Mailpit: https://mailpit.axllent.org/docs/install/docker/, https://mailpit.axllent.org/docs/api-v1/, https://raw.githubusercontent.com/axllent/mailpit/master/server/ui/api/v1/swagger.json
