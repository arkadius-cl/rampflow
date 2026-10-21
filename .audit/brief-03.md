You implement part of OpenSpec change `03-tenant-onboarding` of rampflow (multi-tenant dock & yard management SaaS) in the main checkout /home/arkadius/workspace/rampflow on branch `feat/03-tenant-onboarding`. Earlier phases of the same change may already be committed on this branch; later phases follow after you. No other agent writes to this checkout while you run.

Read first: AGENTS.md, /home/arkadius/workspace/rampflow/.audit/context-notes.md (binding coordinator notes), then the change: openspec/changes/03-tenant-onboarding/{proposal.md,design.md,tasks.md} and every file under its specs/. Then docs/INDEX.md and the docs/code your tasks touch. Reuse existing kernel code and 02's code (apps/api/src/modules/core/signup/, tenant status, activated_at) before writing new helpers.

Environment: Postgres and Mailpit already run (podman); never stop them. The checkout's .env is set; `pnpm db:setup && pnpm db:migrate` if your DB needs it. Never `pkill -f`/`killall`; stop only PIDs you started. Never bare `git stash`.

Coordinator authorization: the coordinator (me) authorizes you to land the contract additions your tasks name yourself on this branch: new value-set members/sets in `packages/shared/src/values/` and `packages/shared/src/modules/core/values.ts` / `booking/values.ts`, `StoryId.ON_01..` in the registry, `GuardKind.active_tenant`, `RouteCase.onboarding`, the i18n part `core/onboarding.json`, and the generated migration `03-tenant-onboarding` (02's custom backfill migration `0008_02-tenant-self-registration-backfill.sql` must survive any `pnpm db:regen`: restore it from git if a regen deletes it). Do not edit manifests/registry/packages.ts beyond what the tasks name; if you need more, stop and report.

Workflow per task: implement, run the task's verify step, then tick it in openspec/changes/03-tenant-onboarding/tasks.md (`- [ ]` → `- [x]`) only when its specified behavior is fully implemented and verified. If a task cannot be done as specified, or you would have to narrow/defer specified behavior, do NOT tick it: finish what you can and report it precisely. Value sets per ADR-0019 everywhere (no string literals of members; `pnpm values:check` and `pnpm lint` must pass).

Commit in small logical commits with `pnpm lint`, `pnpm typecheck` and the tests you touched green (full `pnpm verify` at the end of your phase). Leave todo.md out. Each commit message ends with:

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

Before finishing your phase: run `pnpm verify` and make it green. Prove at least one key test can fail (plant a defect, see red, revert).

Final message (max 400 words): tasks ticked, tasks not ticked and why, deviations from the change's design/contract with reasons, verification output tails (verify, any e2e), planted-defect evidence, and what the next phase must know. If you hit an error you could not fix, describe it exactly (command, output tail, your diagnosis) — the coordinator hands it to a reviewer.
