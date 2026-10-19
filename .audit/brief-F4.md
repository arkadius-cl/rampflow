You fix security findings in rampflow. Work in your own git worktree (your current directory, branched from main). Setup: `pnpm install`, `node scripts/checkout-env.mjs --write`, `pnpm db:setup && pnpm db:migrate`. Read AGENTS.md ("Shared machine": never `pkill -f` patterns, never bare `git stash`, never `git rebase --skip`), docs/decisions/ADR-0003 (auth), ADR-0002 (tenancy), and the review /home/arkadius/workspace/rampflow/.audit/security-review.md (read all of it; finding numbers below refer to it). Another agent (F3) fixes a UI race in apps/web/src/modules/portal/driver-link.tsx; do not touch that file.

Fix, each in its own commit with a test that fails before the fix (show the red output) and passes after:
1. (Medium) A password reset must invalidate every other outstanding reset and magic-link token of that user (and keep revoking other sessions as today).
2. (Medium) Only a `carrier_admin` may bind an existing carrier org to a tenant through invitation acceptance or public-link registration; a `carrier_user` gets a clear 403 (or the flow creates nothing). The tenant's registration/approval view and emails show the name of the org that actually gets linked, not only the typed company name (show both if they differ).
3. (Low-medium) Login CSRF via magic link: opening `/auth/magic#<token>` must not sign the browser in silently. Show the account email and require an explicit "Continue as <email>" click before the exchange (POST). Keep the token in the fragment. Update the e2e helpers/specs that use magic links accordingly.
4. (Low-medium) Production safety must not depend on someone remembering NODE_ENV: treat a missing NODE_ENV as production in apps/api/src/kernel/env.ts (dev and test set it explicitly via scripts/checkout-env.mjs/.env and vitest config; verify they do), refuse the dev TOKEN_SECRET in production, set `Secure` on cookies in production, and refuse `ENABLE_TEST_ROUTES` in production at startup.
5. (Low) The 500 handler must not log bound SQL parameters (emails, hashes, driver data): log the error class, SQL state code and a message without parameters.
6. (Low) Security headers on the API and the SPA: X-Content-Type-Options nosniff, Referrer-Policy, frame-ancestors none (CSP or X-Frame-Options), and HSTS in production; keep the driver CSP. Hono's `secureHeaders` is fine if it fits.
7. (Low) Add a per-IP login limit in addition to email+IP (pick a sane number, e.g. 30 per 15 min, same autocommit mechanism).
8. (Low) Registration verification re-checks that the public link is still enabled and not revoked.
9. (Low) `pnpm db:seed` refuses to run when NODE_ENV is production (and says why).
Leave the rest of the low findings as documented items: add them to a new section "Known security follow-ups" in docs/explanation/architecture-overview.md (or a new docs/explanation/security-model.md with frontmatter if that reads better; then `pnpm docs:index`).

Keep `pnpm verify` green, run the affected e2e specs (auth CR-03, invitations, TN-04/CR-01/CR-02 registration, core-loop) with `pnpm test:e2e <paths>` (no `--`). Rebase onto main before finishing (regenerate generated files on conflict). Commit messages end with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".

Final message (max 300 words): branch, per finding the red output and the fix, verify and e2e results, anything left.
