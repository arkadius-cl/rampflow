# Trail review: rampflow autonomous build run, 2026-10-19

Reviewer: Fable 5.1 (cross-model). Coordinator: Opus 5.5 at xhigh (569 assistant turns, 197 Bash calls, 29 Agent spawns, 13 SendMessages, no human message after the `/goal` prompt).

Inputs checked: `.audit/decisions.tsv` (62 rows), the coordinator transcript (indexed by tool call and tool result, not read whole), `git log` (171 commits), the briefs, reviews and notes under `.audit/`, and the `/tmp/rf-*.log` files the final rows cite (all still present).

Method: every commit SHA resolved with `git log -1`; every path tested with `[ -e ]`; every number in a row searched in the tool output of the call closest to the row's timestamp; agent spawns compared with the owner's model/effort instruction; commits listed chronologically against rows to find unlogged work.

Legend for the row audit: **OK** = action and evidence found in the transcript and resolve; **OK (self-report)** = the row is a real decision, but the quoted claim comes from a sub-agent's final message and the coordinator did not reproduce it; **AHEAD** = the result was logged before the transcript shows it; **FIX** = the row needs a superseding row.

## Audit: rows

| ts | row | verdict | what the transcript and repo show |
|---|---|---|---|
| 09:15:48 | frame: done predicate | OK (weak evidence) | Logged at L80 as the first action. `todo.md` exists (git-ignored) but is a checklist; the predicate text lives only in the row itself. |
| 09:15:48 | frame: rigor high | OK | `docs/CONVENTIONS.md` exists, committed in fac3298. |
| 09:18:27 | harness: docs index + frontmatter check | OK | L105 output: `bad.md` rejected with 7 messages, exit 1; good doc passes. `scripts/docs.mjs` exists. |
| 09:18:27 | harness: postgres 18.6 + btree_gist | OK | L115 output: `PostgreSQL 18.6 ... Alpine`, `CREATE EXTENSION`. |
| 09:19:14 | scaffold started | OK | Agent L131, `poteto-agent-medium`, model opus (matches owner's "Opus medium for implementation"). |
| 09:19:14 | frame: glossary | OK | Write L140; file exists, committed a2fc32e. |
| 09:28:50 | accepted scaffold | OK | f58d3ab..08e8975 are 9 commits 09:18-09:27. L164: 2 unit tests, docs ok (3 docs); L173: Playwright 1 passed. "verify green, e2e green" is true but was a 2-test suite and one smoke spec at that point. |
| 09:32:36 | tech research done | OK (self-report) | Doc exists. Agent ran at `effort-high` (owner allowed high/xhigh for research). Version claims are the agent's. |
| 09:37:18 | market research done | OK | Doc exists; 17 numbered vendor rows counted in the table. |
| 09:40:04 | domain research done | OK (self-report) | Doc exists, committed a2fc32e. |
| 09:40:50 | scope delegated | OK | Agent L231 `effort-xhigh` opus. The 8 rulings are in the prompt. |
| 09:54:47 | accepted scope | OK | 49 distinct story IDs counted in `mvp-scope.md`; f44f255 exists; the Polish pushback with the 22.2 % motorway figure is in the agent's final message (L250); coordinator applied the amendment itself (L265). "21 implemented entitlement keys" not re-counted (catalog table has 28 rows). |
| 09:55:58 | design started | OK | Agents L283 (opus `poteto-agent-xhigh`, main tree) and L285 (fable `poteto-agent-high`, worktree). |
| 10:25:39 | accepted UX | OK | L329 lists 21 PNGs (20 screens + index); coordinator read 3 of them (L338-342). Branch merged at 10:49 (d157eec). |
| 10:49:14 | design: self-built auth | FIX (provenance) | ADR-0003 exists. No coordinator tool call carries this timestamp; the architect agent finished at 10:49:42 and its brief did not ask it to log. The six 10:49:14 rows were written by the sub-agent. The "no public create-session API / TS7 / advisories" argument is the agent's; the coordinator never checked it (the only `better-auth` mentions in coordinator calls are log lines). |
| 10:49:14 | design: capacity lock + occupancy index | OK (agent-authored) | ADR-0004 exists. Note: U1 then replaced the org-row `FOR UPDATE` with an advisory lock and the coordinator rewrote ADR-0004 at 11:45 (a48019c) without a row. |
| 10:49:14 | design: driver token HMAC | OK (agent-authored) | ADR-0008 exists; `DRIVER_LINK_SECRET` later renamed to `TOKEN_SECRET` in a48019c. |
| 10:49:14 | design: migrations one per unit | OK (agent-authored) | ADR-0001 exists. |
| 10:49:14 | contract: 14/14 planted defects, verify green on every commit | FIX (self-report) | 5ad12b6 exists. Both claims come from the agent's final message (L363: "I planted 14 defects and the tests caught all of them", "six commits", "verify passes on every one"). The range 3ad40a3..86339cf holds 5 commits; `/tmp/rf-arch/` holds verify logs for 4 of them and a `mut.log` with a caught mutation. The coordinator ran verify once on the merged state (L377). |
| 10:49:14 | plan: 12 units in 6 waves | OK (agent-authored) | d60f34f, `delivery-plan.md`. |
| 10:51:09 | accepted architecture | OK | 3ad40a3..86339cf exist; L385 text reports verify green with 27 contract tests, 25 docs after the UX merge. |
| 10:51:09 | started two reviewers | OK | Agents L397 (fable, `effort-xhigh`) and L399 (opus, `effort-xhigh`), same prompt. Files exist. |
| 10:51:09 | started U1 before review | OK | Agent L417 opus medium, worktree. The per-checkout port rule is in the prompt. |
| 11:07:28 | fable review forwarded | OK | SendMessage L439 to the U1 agent. Counts 3+11 consistent with the resolution doc's total of 34. |
| 11:12:53 | opus review | OK | File exists; 5+15 consistent with 34. |
| 11:12:53 | second batch + design-fix agent | OK | SendMessage L474; Agent L484 opus `poteto-agent-high` on main (effort above the owner's "medium", see Attention 11). |
| 11:31:17 | design fixes landed | OK | 7 commits 11:19-11:29 on main; `review-resolution.md` line 44: "34 findings. Fixed 17, delegated to U1 17, rejected 0"; SendMessage L506 with the 3 follow-ups; verify at L514. |
| 11:44:57 | merged U1 | OK | e5ad785..6b70824 exist; L545: 28 + 6 + 77 tests, 25 docs; L553: e2e 1 passed. "41 tables" is the agent's count. |
| 11:45:36 | started U2 | OK | Agent L589; `brief-U2.md` exists. |
| 11:46:03 | started U4/U5 early | OK | Agents L615, L617; briefs exist. |
| 12:05:19 | U5 phase 1 done | OK | 508ef96 exists; branch id matches task a8039bfe6840c5cc9. |
| 12:09:11 | merged U4/U5 phase 1 | OK | 49e9e77 exists; L678: 163 API tests (plus 42 shared, 6 i18n). |
| 12:09:31 | started U6a | OK | Agent L705; brief exists. |
| 12:39:36 | merged U2 | OK | 0933bfa; L727: 229 API tests; L734: 14 e2e passed, seed ok. |
| 12:40:41 | started U3, U4p2, U5p2, U7 | OK | Agents L766-772; context-notes and four briefs exist. |
| 12:41:49 | incident: pkill -f | FIX (evidence) | L852 ran `pkill -f concurrently; pkill -f "tsx watch"; pkill -f vite`; L859 checked survivors; L873-881 five SendMessages. Evidence "this row" should point at the transcript. The same pkill also killed the coordinator's own tool shell (L852 returned exit 144), which swallowed the `log-decision verify "checked the shell..."` call: the visual check of the sign-in and shell (`.audit/shots/login.png`, `after-login.png`, read at L839-841) has no row. |
| 12:56:49 | merged U6a | OK | 54a70d6; L899: 307 API tests. "service-level core loop passes" is inside that suite. |
| 12:57:31 | started U9/U10, held others | OK | Agents L940, L942; L924 checked nproc/uptime. |
| 13:07:59 | merged U5 phase 2 | OK | 7123962; L979: 310 API, seed ok; L987: 20 e2e passed (safety + core). |
| 13:08:20 | started U6b | OK | Agent L1012. |
| 13:32:29 | merged U4 phase 2 | OK | 97b9e7e; L1065: 315 API, seed ok. |
| 13:32:46 | started U11 | OK | Agent L1097. |
| 13:55:33 | fixed flaky driver view test | OK | 2062f8e; L1153: 1 of 2 runs red; L1190: run 2 of 3 red; L1273 probe: platform rows 1 before, 0 after. Note the red/green sequence at L1261 did not reproduce (19 passed both times); the evidence is the row-count probe, as the row says. |
| 13:59:59 | merged U9/U10, driver e2e 15 passed | AHEAD | 58a6a03; L1281: 382 API tests. L1314: driver e2e **14 passed, DR-02 failed** after the `pl` change; the coordinator edited DR-02 (L1340) and then ran only `pnpm lint` before committing and logging (L1347). DR-02 first passes in the 14:08 full run (`/tmp/rf-e2e-main.log`) and the 14:12 run. |
| 14:07:31 | fix: Vitest fsModuleCache | OK | e68a967; L1474 (moving `.vite` did not help: first hypothesis wrong, as the row says); L1537 found `node_modules/.vitest-cache`; L1566: cache on 1 failed, cache off 1 passed, suite 443 passed; `/tmp/rf-api-run3.log` 443. |
| 14:07:31 | merged U6b and U7 | OK | U6b/U7 commits at 14:00 sit under e68a967. The rebase loops at 14:00 (L1374-1391) had no `--skip` fallback. |
| 14:08:08 | started U8 | OK | Agent L1602. |
| 14:16:38 | full e2e: 3 failed then 79/79 | OK | `/tmp/rf-e2e-main.log`: 3 failed, 76 passed; `main2.log`: 79 passed; L1665: the 5 specs pass alone; load 7.9/11.1/15.3 at 14:12. Honest INCONCLUSIVE. |
| 14:21:12 | merged U11 | OK | 3148a79; L1702: 487 API tests; the time-bomb note is in U11's message (L1695). Rebase loop had no `--skip`. |
| 14:22:15 | started T1 | OK | Agent L1766; brief exists. |
| 14:46:25 | second platform-row leak fix | OK | def6771; L1803: 511 passed, 1 failed; L1848 probe: 1 before, 0 after; L1858: 512 passed. |
| 14:46:25 | merged U8 | OK | U8 commits 14:37 under def6771. U8 reported "waiting on its own background work" (L1787); the coordinator checked the worktree was clean (L1794) before merging. |
| 14:50:42 | U3 rebase incident | OK | L1910: `(git rebase --continue || git rebase --skip)` and the output "Could not apply 3979311... Add the tenant screens"; L1921: typecheck errors in `brand/logo.tsx`; L1934: reset to 3dd3dbf (exists, dangling); `/tmp/rf-resolve.sh` has no skip; `/tmp/rf-u3-verify.log`: 575 passed, 1 failed (scrypt timing); L1961: 3/3 alone; L1969: load from Playwright in the T1 worktree and the faketime containers. Accurate. |
| 14:50:42 | merged U3, "api green" | FIX (ahead) | 19a924b. On main the merge step ran install, migrate, seed, lint and typecheck only (L1978); "api green" rests on the worktree run with one failed timing test. The API suite on main including U3 first went green at 15:31 (576, L2159). "U3 e2e pending" was never run as a subset; the final 111 (e2e/core 31) covers it. |
| 14:51:43 | started U12 and D1 | OK | Agents L1995, L2018; briefs exist. |
| 15:28:14 | merged D1 | OK (self-report for "6 false statements") | 82e6e25; L2072: docs ok 38; 14 PNGs in `docs/assets/screens/`. |
| 15:28:45 | started F1 | OK | Coordinator read `plan-board.png` (L2079); Agent L2116; SendMessage to U12 (L2118). |
| 15:34:40 | merged T1, reran +40d | OK | L2159: 576; `/tmp/rf-at40.log`: 53, 6, 576 passed; L2181 confirmed both clocks on 2026-11-28. Evidence cell has a stray leading quote. `test-at-date.sh` covers unit and API suites only; the e2e gap stays open. |
| 15:54:24 | merged F1 | OK (self-report for red-first) | ee16ca4; L2204: 580 API tests; coordinator read `plan-open.png` (L2195). The quoted red outputs ("21G7BS48 covers 8EA10F68", "expected -50 to be 10") are from F1's message (L2192); the brief demanded red-first, the coordinator did not reproduce it. |
| 16:28:47 | final check on quiet machine | OK | Load 3.20 at start (L2276). `/tmp/rf-final-verify.log`: 53, 6, 584 passed (3 skipped), docs ok 38, i18n current; build exit 0; "140.5 KB gzip initial JavaScript, budget 150 KB" (L2267); `/tmp/rf-final-e2e.log`: 111 passed (5.5 m); L2323: `/`, `/login`, `/d/`, `/api/health` all 200, `content-security-policy: default-src 'self'...`, `referrer-policy: no-referrer`; L2314: "Set TOKEN_SECRET in production" refusal. The first prod start failed on the coordinator's own PATH mistake (L2300), not the app. |
| 16:30:20 | regenerated screenshots | FIX (minor) | 3763818; L2360-2364 read gate-check-in, driver-called and reports. The plan board was not re-read after regeneration; it was last viewed on the F1 branch at 15:52. |
| 16:31:09 | lessons encoded | OK | b4914be; AGENTS.md lines 68, 75-77 carry the date, pkill, stash and `--skip` rules; `vitest.config.ts` has `fsModuleCache: false`; `test/setup.ts` deletes platform rows in `afterAll`. |

Summary: 62 rows; 55 map cleanly to a transcript action with resolving evidence. 2 rows log a result ahead of its proof (13:59:59, 14:50:42). 1 row needs an evidence pointer (12:41:49). 6 rows at 10:49:14 were written by a sub-agent and read as coordinator decisions; 1 of them carries unverified test claims. 1 row overstates what was looked at (16:30:20). No SHA or path fails to resolve; every number in a verify/merge row matches a tool output except the two "ahead" cases.

## Audit: gaps

Events that shaped the work and have no row:

1. **U12 merge (16:20, L2248-2258).** Nine commits bf64325..8aede26 (core-loop spec, time-zone spec, tenant logo on carrier pages, driver PWA and emails, toasts at the top). U12 used its own sub-agent for TN-05 (branch 0eabe88, worktree a2f0ab509aba3af74); the coordinator cherry-checked that its three logo commits are in main before deleting it. The row that follows (16:28:47) starts with "final check" and never says U12 landed.
2. **Visual check of sign-in and shell (12:41, L816-841).** The coordinator wrote `.audit/shot.mjs`, screenshotted `/login` and the shell as the Acme admin through the Playwright container and read both PNGs. The log call for this was inside the command that ran the fatal `pkill -f`, which returned exit 144; the row was never written. The desktop preview tool was tried first and failed (L809).
3. **Nested sub-agents inside units.** U3 handed its web screens to a sub-agent (12:59, L969); U12 built the logo with a sub-agent (L2243); U8 finished with background work still running (L1787). Model and effort of those nested agents were chosen by the unit agents, not by the coordinator, so the owner's "Opus medium for implementation" is unverified for that code.
4. **Coordinator's ADR alignment commit a48019c (11:45, L571).** U1 built an advisory lock per tenant and limit key instead of the `FOR UPDATE` on the org row that ADR-0004 prescribed, and renamed `DRIVER_LINK_SECRET` to `TOKEN_SECRET`. The coordinator accepted both by editing the ADRs. This is a design deviation accepted after the fact, without a row.
5. **Provenance of the 10:49:14 block.** The TSV has no author column. The six rows were written by the architect agent; a reader takes them as the coordinator's decisions and the "14/14 planted defects" as verified.
6. **Process-rule additions outside the trail.** The "never pkill -f" rule went into `context-notes.md` at 14:00 (L1405) and a second near-miss at 16:30 (PID file pointed at the exited `setsid` wrapper; servers found by port and killed by session id, L2349-2356) is not in the lessons row.
7. **Misidentified process at 13:32 (L1084).** The coordinator checked PID 3320907 as "the U4 agent process"; the 14:50 `ps` output shows it is the coordinator's own `claude` process. No consequence, but the "force-remove" that followed was done on a wrong premise.
8. **T1 follow-up.** The 15:34:40 row marks "e2e browser clock not shiftable (open)". No row or todo item picks it up; the final verification does not mention it.

## Attention

Ranked by how much the owner should care; each item points to a row timestamp or a transcript line.

1. **Self-built authentication, accepted on an unverified claim (rows 10:49:14, ADR-0003).** The architect agent dropped better-auth for its own scrypt hashing and hashed session table, arguing better-auth cannot mint a session after a custom token check. The coordinator did not check that claim (no better-auth lookup in its calls), the two reviewers reviewed the design, not the code, and the kernel and identity code were then written by Opus medium (U1, U2). The scope's NFR line was amended to fit. Auth code written this way deserves a dedicated security review before any real tenant.
2. **E2E suite is not proven date-independent (row 15:34:40 "(open)").** T1 found that driver links of seeded "world" bookings expire on 2026-11-09 and a cancel test turns "late" with time; `scripts/test-at-date.sh` only shifts the unit and API suites. The Playwright specs and the seed still run at wall time. The 111/111 is a today result; nothing shows it holds in three weeks.
3. **Nested sub-agents outside the owner's model rule (gap 3; L969, L2243).** U3's web screens and U12's logo work were built by sub-agents the unit agents spawned. Their model/effort is not in this transcript.
4. **Rows whose only evidence is a sub-agent's final message.** 10:49:14 contract ("14/14 planted defects caught", "verify green on every commit": 4 logs for 5 commits in `/tmp/rf-arch/`); 15:54:24 F1 ("red first" quotes); 15:28:14 D1 ("6 false doc statements"); the three research rows. The coordinator verified the merged state each time, so the code claims hold; the test-quality claims do not.
5. **"driver e2e 15 passed" logged before it was true (row 13:59:59, L1314-1347).** The run before the DR-02 edit was 14/15; after the edit only lint ran. It became true in the 14:08 full run. Pattern to watch: a result cell written from intent.
6. **U3 merged onto main with lint and typecheck only (row 14:50:42, L1978).** The API suite on main including U3 first ran at 15:31. The worktree run had one failure, a scrypt timing assertion (`median(unknown) > 0.5 * median(known)`, `auth.test.ts:106`) that is inherently load-sensitive and will flake on a busy CI runner.
7. **Six agents on six cores, load up to 136 (rows 12:57:31, 14:16:38, 14:50:42).** Three e2e specs and two timing tests failed only under load. The final gate was run quiet (load 3.2), which is right, but the suite has no margin: 5 s expects, 90 s spec timeouts, a timing assertion. Expect flakes on shared runners.
8. **Pattern kills on a shared host (row 12:41:49).** `uptime` shows 6 logged-in users; `pkill -f vite` matched any process with "vite" in its command line on the whole machine, not only this repo. It also killed the coordinator's own shell (exit 144) and lost a row. The rule is now in AGENTS.md; whether any neighbour process died is unknown.
9. **Global cleanup instead of isolation (row 14:46:25, `apps/api/test/setup.ts`).** `afterAll` deletes every platform-level `setting_value` row after each test file. It cures the leak and is cheap, but it also means no test can rely on platform defaults being present, and a future migration that seeds platform defaults would be wiped mid-suite. No migration seeds such rows today.
10. **KPI "wait" clamped at zero by a fix agent (row 15:54:24, 398122d).** A truck that is docked before its slot now counts 0 wait in the average and the visit list. That is a reporting-semantics decision (wait measured from arrival, floor 0) made in a defect-fix brief; the owner may want it measured from the booked start instead.
11. **Model/effort choices.** Implementation units: all 18 on Opus medium, as instructed. Research: Opus xhigh/xhigh/high, as instructed. Beyond the instruction: architecture on Opus xhigh (poteto), design-fix agent on Opus high, two reviewers on xhigh (one Fable), the coordinator itself on Opus xhigh. Fable did the UX concept and 20 prototype screens (as allowed); every production screen was then built by Opus medium units. shadcn-first was honoured (39 shadcn components, 10 domain-specific custom ones). Diátaxis with frontmatter and index: `docs:check` green, 38 docs, four quadrants plus ADRs.
12. **Trail provenance and what gets committed.** The log script records no author, so sub-agent rows (10:49:14) are indistinguishable from coordinator rows; one row cites "this row" as evidence. `.audit/` is untracked today and AGENTS.md was just changed to say units do not edit it, which implies it will be committed: that brings 2.5 MB of PNGs (`ux-screens/`, `shots/`) and `env.main.bak` (compose defaults, no secrets) into the repo.
13. **Scope beyond MVP, all justified but worth knowing.** T1 built faketime images for Postgres and Playwright and a clock-shifting runner; D1 added a podman-driven `docs:screens`; both leave custom images on the owner's machine (`rampflow-faketime-postgres:18`, `rampflow-faketime-playwright:1.64.1`).

## Superseding rows to add

Suggested text, one TSV row each (phase, decision, why, evidence, result):

1. `build` | merged U12 core loop e2e at 16:20: 9 commits bf64325..8aede26 incl. the TN-05 logo commits of U12's own sub-agent (branch 0eabe88), cherry-checked against main before deleting the worktree | U12 reported 111/111 twice; the coordinator's own run at 16:27 is the gate | transcript L2248-2258, /tmp/rf-final-e2e.log | e2e 111/111 on quiet machine
2. `verify` | checked sign-in and the shell on main visually at 12:41 (.audit/shots/login.png, after-login.png via the Playwright container; desktop preview tool unavailable) | catch visual drift before more screens are built | .audit/shot.mjs, .audit/shots/ | ok; the log call was killed by the pkill (exit 144), so the row was lost
3. `correction` | 13:59:59 result "driver e2e 15 passed" was logged before any rerun; at merge time it was 14/15 with DR-02 red after the pl change | the cell was written from intent | transcript L1314, L1347; /tmp/rf-e2e-main.log DR-02 green | 15/15 first shown in the 14:08 full run
4. `correction` | 14:50:42 "api green" for U3: on main only lint and typecheck ran at merge; the API suite was measured in the worktree (575 passed, 1 timing test failed) | load 136 at the time | /tmp/rf-u3-verify.log, transcript L1978 | API suite on main incl. U3 first green at 15:31 (576)
5. `provenance` | the six 10:49:14 rows were written by the architecture sub-agent, not the coordinator; "14/14 planted defects" and "verify green on every commit" are its claims (verify logs exist for 4 of 5 commits) | the trail has no author column | /tmp/rf-arch/, transcript L363 | coordinator acceptance is the 10:51:09 row
6. `design` | accepted U1's deviations from the ADRs at 11:45: advisory lock per tenant and limit key instead of FOR UPDATE on org (ADR-0004), DRIVER_LINK_SECRET renamed TOKEN_SECRET (ADR-0008) | the kernel as built is simpler and needs no UPDATE policy on org | commit a48019c | ADRs aligned
7. `build` | units U3 (web screens) and U12 (tenant logo) spawned their own sub-agents; their model and effort were chosen by the units, not the coordinator | not foreseen in the briefs | transcript L969, L2243 | code reviewed by the unit agents; owner's model rule unverified for it
8. `correction` | 16:30:20 looked at gate check-in, driver call and reports only; the plan board was last viewed on the F1 branch at 15:52, not after the final regeneration | three Read calls at 16:30 | transcript L2360-2364 | plan-board.png regenerated but not re-inspected
