You make rampflow's dev servers reachable from other devices in the LAN (owner request: "dev soll die Anwendung immer am LAN-Interface lauschen lassen"). Work in your own git worktree (your current directory, branched from main). Setup: `pnpm install`, `node scripts/checkout-env.mjs --write`, `pnpm db:setup && pnpm db:migrate`. Read AGENTS.md first ("Shared machine": never `pkill -f` patterns, never bare `git stash`, never `git rebase --skip`; stop only processes you started, by PID or session).

Facts the coordinator checked:
- apps/api/src/server.ts calls `serve({ fetch, port })` without a hostname, so Node already listens on `::` (all interfaces). apps/web/vite.config.ts and apps/driver/vite.config.ts set no `server.host`, so Vite listens on localhost only.
- apps/api/src/kernel/origin.ts `requireSameOrigin(appOrigin)` refuses every POST/PUT/PATCH/DELETE whose `Origin` differs from `APP_ORIGIN`. A browser at http://192.168.0.10:5173 sends that origin, so all writes would fail with 403.
- `APP_ORIGIN` also builds the emailed driver link (`driverLinkUrl`), logo URLs and invitation links. In dev it is `http://localhost:<WEB_PORT>`, which a phone cannot open.
- scripts/checkout-env.mjs derives per-checkout keys (CHECKOUT_KEYS includes APP_ORIGIN) and `--write` persists them into `.env`; `resolvedEnv()` merges example < derived < .env < process env; the `--e2e` profile sets `APP_ORIGIN=http://localhost:<web+5>`.
- This machine has eno1 192.168.0.10/24 and tailscale0 100.74.97.126/32.

Target shape (types first):
1. scripts/checkout-env.mjs, dev profile only, computed at run time (never persisted, so a new DHCP address needs no rewrite):
   - `DEV_HOST`: process env or `.env` value if set (a developer's override, may be an IP or a hostname); else the first non-internal IPv4 from `os.networkInterfaces()` in an RFC 1918 range; else the first non-internal IPv4 of any range; else `localhost`.
   - `APP_ORIGIN = http://${DEV_HOST}:${WEB_PORT}` unless APP_ORIGIN is set explicitly in process env.
   - `APP_EXTRA_ORIGINS`: comma-separated `http://localhost:<web>`, `http://127.0.0.1:<web>` and `http://<every non-internal IPv4>:<web>`, without the APP_ORIGIN itself.
   - `--write` no longer persists APP_ORIGIN (remove it from the written file, keep DEV_HOST if the developer set it). The e2e profile stays on localhost with no extra origins.
2. apps/api/src/kernel/env.ts: `APP_EXTRA_ORIGINS` parsed at the boundary into `string[]` of validated URL origins (default empty).
3. apps/api/src/kernel/origin.ts: `requireSameOrigin(origins: readonly string[])` with a Set of normalized origins; app.ts passes `[env.APP_ORIGIN, ...env.APP_EXTRA_ORIGINS]` (keep the `appOrigin` option for tests working). Production with no extras stays exactly as strict as today.
4. Both Vite configs: `server.host: true` (all interfaces). If DEV_HOST is a hostname rather than an IP, add it to `server.allowedHosts` so Vite's host check accepts it. The `/api` and `/d` proxies keep targeting localhost.
5. docs/how-to/run-locally.md: a section "Open the app from another device in the LAN" (which URL, DEV_HOST override, emailed driver links use the LAN host, and that service worker install, clipboard copy and the Web Share sheet need a secure context, so over plain http on a LAN IP the PWA works without install/offline and copy/share may be unavailable). Update AGENTS.md's `pnpm dev` row in one short clause. Run `pnpm docs:index`.

Tests (each must fail before your change; show the red): origin middleware accepts APP_ORIGIN and an extra origin, refuses a foreign one; env parsing of APP_EXTRA_ORIGINS (valid list, invalid entry rejected, default empty). For checkout-env, show the derived values with `node scripts/checkout-env.mjs run -- node -e "console.log(process.env.APP_ORIGIN, process.env.APP_EXTRA_ORIGINS, process.env.DEV_HOST)"` before and after, and that `--e2e run` still prints localhost.

Verify on the real surface in your worktree (its ports come from your .env): run `pnpm dev` in its own session, then from this machine: `ss -ltn` shows the web and driver ports on 0.0.0.0 or *, `curl http://192.168.0.10:<web>/api/health` answers ok, a POST to `/api/auth/login` through `http://192.168.0.10:<web>` with `Origin: http://192.168.0.10:<web>` does NOT answer 403 origin, the same POST with `Origin: http://evil.example` answers 403. Stop the dev session by its session id. Then `pnpm verify` green and `pnpm test:e2e e2e/core` green.

Commit in small commits ending with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Rebase onto main before finishing. Final message (max 250 words): branch, what changed, red/green evidence, the real-surface outputs.
