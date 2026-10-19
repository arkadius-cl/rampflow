---
title: Run rampflow locally
description: Start Postgres and Mailpit, install dependencies, run the API and web app in dev mode, and run unit and end-to-end tests.
type: how-to
audience: [developer, agent]
tags: [setup, dev, testing, database, mail]
status: stable
updated: 2026-10-19
---

# Run rampflow locally

## Prerequisites

- Node.js 24 or later.
- pnpm 12 (the version in `packageManager` in `package.json`).
- Podman with `podman compose`.

## Start the services

1. Copy the environment file. The defaults match `compose.yaml`.

   ```sh
   cp .env.example .env
   ```

2. Start Postgres and Mailpit. The command waits until both containers are healthy.

   ```sh
   pnpm db:up
   ```

   | Service | Address |
   |---|---|
   | Postgres 18 | `postgres://rampflow:rampflow@localhost:5432/rampflow` |
   | Mailpit SMTP | `localhost:1025` |
   | Mailpit web UI | <http://localhost:8025> |

   On first start, `infra/postgres/init/01-extensions.sql` creates the `btree_gist`, `pgcrypto` and `citext` extensions. The script runs only when the data volume is new.

3. To stop the services, run `pnpm db:down`. The data volume stays. To delete the data, run `podman compose down -v`.

## Install and run the apps

1. Install dependencies.

   ```sh
   pnpm install
   ```

2. Start the API and the web app together.

   ```sh
   pnpm dev
   ```

   - The API listens on <http://localhost:3000>. `tsx watch` restarts it on change.
   - The web app runs on <http://localhost:5173>. Vite forwards `/api` requests to the API.

3. Open <http://localhost:5173>. The home page shows `ok` for the API and the database.

To check the API through the Vite proxy:

```sh
curl http://localhost:5173/api/health
# {"status":"ok","db":"ok"}
```

## Run the checks

Start the services with `pnpm db:up` first. The API tests connect to the real Postgres from `DATABASE_URL`.

| Command | What it runs |
|---|---|
| `pnpm lint` | Biome lint and format check. |
| `pnpm format` | Biome fixes, including formatting. |
| `pnpm typecheck` | `tsc -b` in every package, plus the e2e folder. |
| `pnpm test` | Vitest in every package that has tests. |
| `pnpm docs:check` | Doc frontmatter and `docs/INDEX.md` freshness. |
| `pnpm verify` | `lint`, `typecheck`, `test` and `docs:check` in order. |

## Run the end-to-end tests

```sh
pnpm test:e2e
```

This runs Playwright 1.64.1 inside the `mcr.microsoft.com/playwright:v1.64.1-noble` container with host networking. Use it when the host is missing the system libraries that Chromium needs. Playwright starts the API and the web app itself, or reuses them if `pnpm dev` already runs.

If Chromium runs on your host, you can run Playwright directly:

```sh
pnpm exec playwright install chromium
pnpm test:e2e:host
```

## Read sent email

Mailpit catches every message sent to `localhost:1025` and delivers none of them. `SMTP_HOST` and `SMTP_PORT` in `.env` point there. The scaffold does not send mail yet. When it does, open <http://localhost:8025> to read each message.
