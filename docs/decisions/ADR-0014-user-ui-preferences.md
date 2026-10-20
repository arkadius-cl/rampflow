---
title: ADR-0014 User UI preferences in app_user.ui_prefs, merged per key
description: Why per-user UI state such as the open entitlement groups lives in a jsonb column on app_user, why writes merge key by key, why every key has its own zod schema and stale keys are dropped on read, and why the column holds UI state only.
type: explanation
audience: [agent, developer]
tags: [adr, ui, preferences, api, data-model]
status: stable
updated: 2026-10-20
related: [docs/reference/data-model.md, docs/reference/api-routes.md, docs/explanation/mvp-scope.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md]
---

# ADR-0014: User UI preferences in `app_user.ui_prefs`, merged per key

Status: accepted, 2026-10-20.

## Context

The platform screens group entitlements by module and let the admin fold the groups (PL-02). The admin works on several office computers, so which groups are open must follow the user, not the browser. Browser-only state today: the last org and site (localStorage) and the sidebar (cookie).

The web already loads `GET /api/me` for every signed-in user before any area renders, and `PATCH /api/me` changes `name` and `locale`. `app_user` rows are readable by the user, by members of shared orgs (`app.shares_org`) and by the platform ([ADR-0002](ADR-0002-tenancy-isolation-rls.md)).

## Options considered

| Option | Verdict |
|---|---|
| localStorage | Stays in one browser; fails the requirement. |
| A table `user_pref(user_id, key, value)` with RLS for the user only | Private and needs no merge, but adds a table, an ORACLE rule, model rows, a new endpoint and its route cases for a few bytes of UI state. |
| A jsonb column replaced as a whole on write | A second computer wipes the keys the first one wrote. |
| **A jsonb column on `app_user`, merged per key, read and written through `/api/me`** | One column, no new route; the web reads it from the `meQuery` it already has. |

## Decision

- **Storage.** `app_user.ui_prefs jsonb not null default '{}'` with the check `jsonb_typeof(ui_prefs) = 'object'`.
- **API.** `GET /api/me` and the response of `PATCH /api/me` carry `uiPrefs`. `PATCH /api/me` accepts `uiPrefs` with any subset of the known keys and writes `ui_prefs = ui_prefs || $patch` in the same statement as `name` and `locale`. A write touches only its own keys; the same key written twice is last-writer-wins.
- **One zod schema per key.** `UI_PREFS` in `packages/shared/src/modules/core/ui-prefs.ts` maps every key to its schema. Keys are named `<area>.<screen>.<what>`. The request schema is strict: an unknown key or an invalid value answers 422 and stores nothing. A new key is one line and needs no migration.
- **Drop on read.** The server parses each stored key on its own and leaves out unknown keys and values that no longer match, for example a list holding a renamed module id. `/api/me` never fails because of stored preferences.
- **UI state only.** Everyone who can read the user row can read `ui_prefs`, including org admins through `shares_org`. The column therefore holds UI state, never secrets or personal data. Routes that list users keep selecting explicit columns, so it does not appear in staff responses. Anonymizing a user (privacy retention job) resets it to `{}`.
- **Web.** `useUiPref(key)` in `apps/web/src/lib/access.ts` reads the value from `meQuery`, writes the cache at once and sends `PATCH /api/me` after 400 ms without another change to the key. On error it shows the standard toast and refetches `/api/me`.

## Consequences

- Other screens add per-user UI state by adding a key and its schema to `UI_PREFS`.
- If preferences ever need to be private, they move to a table with RLS for the user only. The API shape (`uiPrefs` on `/api/me`) stays the same, so the web does not change.
- The packages page and the tenant page keep separate keys (`platform.packages.openModules`, `platform.tenant.openModules`); the tenant page uses one set for all tenants.
