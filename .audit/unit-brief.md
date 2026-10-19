You implement unit {{UNIT}} of rampflow (multi-tenant dock & yard management SaaS MVP) in your own git worktree (your current directory, branched from main). Other units of the same wave run in parallel in their own worktrees; stay strictly inside your unit's file ownership.

Setup: `pnpm install`, then `node scripts/checkout-env.mjs --write` (per-checkout ports and database names; see docs/how-to/run-locally.md "Run several checkouts in parallel"), then `pnpm db:setup && pnpm db:migrate`. Postgres 18 and Mailpit already run via podman compose (5432, SMTP 1025, API/UI 8025); never stop them and never touch another checkout's database.

Read first: /home/arkadius/workspace/rampflow/.audit/context-notes.md (coordinator notes, binding), AGENTS.md, docs/INDEX.md, docs/explanation/delivery-plan.md (sections "Shared files", "Merge procedure" and "{{UNIT}}" are your contract), docs/explanation/mvp-scope.md (the stories {{STORIES}}), then {{READ}}. Look at the existing kernel code before writing new helpers; reuse it.

Do exactly {{UNIT}}: its Owns, Provides, Tests and Verify as written in the delivery plan. {{EXTRA}}

Rules:
- UI: original shadcn components first (apps/web/src/components/ui, style base-nova on Base UI, the Field pattern for forms with react-hook-form + zod). Reuse the UX prototype components in apps/web/src/components (shells, plan-board, slot-picker, status-badge, site-time, settings-field, entitlement-gate) and match the look of the screens under apps/web/src/routes/design/. Custom components only when nothing in shadcn fits.
- All user-facing strings through i18next catalogs (de, en, pl for staff/carrier UI; 12 locales for driver) in your unit's namespace parts.
- Times: UTC in the DB, site-local display with zone label via the shared time module.
- Every API route you add gets route cases (foreign tenant, foreign site, missing permission, entitlement off) in the kernel's route-case harness; behavioral tests against real Postgres, no DB mocks.
- If the contract (manifests, references, ADRs) is wrong or missing something, do the smallest sound thing, and list the deviation with its reason in your report. Do not edit packages/shared manifests, registry, packages.ts or index.ts (coordinator-owned); report needed changes instead.
- Update only your module's sections in docs/reference/*; add a how-to doc for your module's main admin/operator task if it helps users (Diátaxis frontmatter per docs/CONVENTIONS.md); run `pnpm docs:index`.
- Before finishing: rebase onto main (`git fetch` is not needed, main is local: `git rebase main`), follow the Merge procedure in the delivery plan (db:regen, routes:gen, docs:index), and make the unit's Verify command green. Prove at least one key test can fail (plant a defect, see red with the expected message, revert).
- Commit in logical commits; each message ends with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".

Final message (max 400 words): branch name, what you built (stories covered), deviations from the contract with reasons, needed coordinator changes (manifests etc.), verification output tails, planted-defect evidence, and what later units must know.
