# M4 Verification Engine — Kickoff Plan

Status: **All 4 slices implemented; two real E2E attempts run, both precisely blocked
(2026-07-06). M4 not yet complete.** Owner: Full-stack/QA.

This plan grounds M4 ("Verification / Repair Loop") in what is actually running today, per
`docs/engineering/ENGINEERING_MASTER_PLAN.md` §3/§5 and `project/milestones.yaml` M4. It
originally shipped as planning-only; slices 1-3 (§10) are now implemented.

**Slice 1** (`feature/m4-verification-slice-1`):

- `server/src/services/verification/workspace.ts` — materializes a branch into a temp dir via
  the existing `github.getRepoFiles` fetcher (injectable for tests).
- `server/src/services/verification/checks.ts` — `detectAvailableChecks` (reads the target
  repo's `package.json` scripts, never fabricates availability) and `runCommand`/`runInstall`
  (injectable `execFile`-based command runner, classifies Passed/Failed/Errored, enforces a
  timeout, never shells out to a string command).
- `server/src/services/verification/verify.ts` — `runVerification()` ties the above together
  and persists one real `qa_runs` row per job via `persistQaRun`.
- `server/src/services/orchestrator/index.ts`'s QA step calls `runVerification` for a real
  `lint` check instead of logging fake progress lines.

**Slice 2** (`feature/m4-verification-slice-2`, on top of slice 1):

- `verify.ts`'s `runVerification()` now runs **all four** checks (`lint`/`build`/`typecheck`/
  `test`) the target repo defines — each independently detected/skippable — and persists a
  single `qa_runs` row with all four `*_passed`/`*_output` columns populated. Added
  `listQaRuns(jobId)` to read them back.
- The orchestrator's QA step now **gates the pipeline**: any `failed` or `errored` check throws
  (mirroring this codebase's existing `runJobPipeline` → `createJob`'s catch → `status='failed'`
  error-propagation convention, rather than introducing a new manual-status-update path), so the
  job never reaches `preview`/`review` on a real problem. A `skipped` check never blocks it.
- New `GET /api/jobs/:id/qa` route (`server/src/routes/jobs.ts`) returns a job's `qa_runs` rows,
  most recent first, mirroring the existing `/preview` route's `JobsRouterDeps` DI pattern.
- No `qa_runs` migration — the table already had all the columns needed (confirmed in §3 below).

**Slice 3** (`feature/m4-verification-slice-3`, on top of slice 2):

- A **bounded repair loop** (§6/§10): when verification has one or more `failed` (not
  `errored`, not `skipped`-only) checks, the orchestrator now re-invokes the BUILD provider flow
  with the original plan, every file generated so far, and the exact failing check(s)' output,
  instructing it to return a minimal fix. Capped at 2 repair attempts, counted from existing
  `qa_runs` rows for the job (no new column) — see `decideRepairAction()` in
  `server/src/services/orchestrator/index.ts`.
- An `errored` check is never repaired (infrastructure problem, not a code problem) — the job
  fails immediately, same as slice 2. A `skipped` check still never blocks progression.
- After a repair, verification re-runs in full (all four checks again) against the newly
  committed files; a pass proceeds to `preview`/`review`; a persisting failure repairs again (up
  to the cap) or fails the job once exhausted.
- The repair decision itself (`decideRepairAction`) is a pure, exported function — the rest of
  `runJobPipeline` (PLAN/BUILD/PREVIEW/REVIEW) is not unit-tested end-to-end in this codebase
  (no DI harness exists for it), so the loop's actual branching logic is tested directly rather
  than through a full mocked pipeline run, consistent with how `buildPreviewUrl`/
  `pollPreviewReady` were already tested this way before slice 3.
- No `qa_runs` migration in slice 3 either — repair attempts are still just additional rows.
- 10 new tests (118/118 server tests passing, up from 108 after slice 2) — see §9.

**Slice 4** (`feature/m4-verification-slice-4`, on top of slice 3, which merged to `main` via
PR #27):

- Four explicit, final scope decisions, recorded in
  `adr/0008-m4-verification-scope-boundaries.md` (Accepted): preview-error-triggered repair
  (§2's original design, distinct from the QA-step repair loop) — **deferred**, no capture
  mechanism exists yet; accessibility smoke checks — **deferred**, would need a running preview
  instance to test against, not expressible as a `package.json` script the way the existing four
  checks are; license checks — **deferred, out of the verification engine's scope entirely**,
  already owned by M3.3/RISK-3/RISK-8 as a harvester concern; structured timing — **added now,
  in-memory only**.
- `server/src/services/verification/checks.ts`'s `CheckResult` gained a `durationMs: number |
  null` field, measured with `Date.now()` deltas around `runCommand`'s and `runInstall`'s
  `exec()` calls. `null` means the check's command was never actually invoked (skipped, or an
  upstream failure — a failed install or workspace materialization — that never reached the
  check); every outcome that did actually execute (passed, failed, or errored via timeout/spawn
  failure) carries a real measured value. Not persisted to `qa_runs` — no migration, since no
  consumer of a `duration_ms` column exists yet (§3, unchanged).
- Real, partial progress on the slice 1-3 "not yet run against a real job" caveat (RISK-18/
  SPR-12): a locally-started Postgres instance had all 5 migrations applied for the first time
  in this project's history, and `persistQaRun`/`listQaRuns` were exercised against that genuine
  database (not injected fakes), confirming correct round-trip behavior and most-recent-first
  ordering. The GitHub-API and real-provider legs of a full end-to-end job remain blocked in
  this environment (a non-functional `GITHUB_TOKEN` session-proxy placeholder, confirmed via a
  direct `403` against the real GitHub API; no provider API key present) — see §11's updated
  status notes.
- 1 new/updated test file group (`checks.test.ts`, `verify.test.ts`), asserting every
  passed/failed/errored check reports a numeric `durationMs` and every skipped (or
  never-invoked) check reports `null` (119/119 server tests passing, up from 118 after slice 3).

**Real E2E verification attempt** (`feature/m4-e2e-verification-proof`, on top of slice 4, which
merged to `main` via PR #28):

- **Runtime prerequisites checked directly, not assumed:** a local Postgres 16 instance was
  started and all 5 migrations applied cleanly (repeat of slice 4's finding, on a fresh
  container). `GITHUB_TOKEN` is present but non-functional; no `OPENAI_API_KEY`/
  `ANTHROPIC_API_KEY` is present. The real server (`npm run dev` equivalent, `tsx src/index.ts`)
  boots successfully against the real Postgres instance with `DEFAULT_PROVIDER=mock`.
- **A real job was driven through the actual HTTP API** (`POST /api/generations`, a real repo
  URL, a real prompt) against the real Postgres instance — not a unit test, not a function call.
  The job's PLAN step completed for real (mock provider). BUILD then called the real GitHub REST
  API to create a feature branch and received a genuine `401 Bad credentials` — captured
  verbatim from the running server's own log output and from the job's persisted
  `error_message` column: `GitHub API error during getBranchSha(TFRS-Admin/Code-Gen-AI#main)
  (status 401): Bad credentials`. The job's `status` column reads `failed`. Confirmed via direct
  SQL query: **zero `qa_runs` rows exist for this job** — it never reached the QA/verification
  step introduced by slices 1-3 at all. This is the same GitHub-credential blocker documented in
  slice 4, now demonstrated by the real application itself (a genuine 401 from its own Octokit
  client) rather than inferred from a standalone `curl` test against a different endpoint.
- **The verification+repair mechanics were separately proven against genuinely real tool
  execution.** A small demo repo (real `package.json`, real `.eslintrc.json`, a real
  `no-unused-vars` violation, real `npm install`) was read via an injected `fetchRepoFiles` (the
  one substitution — standing in for the blocked GitHub fetch) but everything downstream ran for
  real: `runVerification()`'s default `execFileImpl` ran genuine `npm install` and `npm run
  lint`; the real ESLint binary genuinely failed; the result was persisted via the real
  `persistQaRun` to the same live Postgres instance. `decideRepairAction()` — called with that
  *real* `VerificationResult` (not a hand-built fixture, unlike every existing unit test) —
  correctly returned a `repair` decision. A fix was then applied directly to the file (the
  second substitution — standing in for a real LLM-produced patch, since no provider key is
  available) and verification re-ran for real: the real ESLint binary genuinely passed, a second
  real `qa_runs` row was persisted, and `decideRepairAction()` correctly returned `proceed`. Both
  rows were independently confirmed via a direct `psql` query, not just the application's own
  read path.
- **Net result:** the verification engine and repair-decision logic behave correctly against
  genuine tool execution and genuine persistence — that gap is now closed. What remains
  unverified is precisely the two credential-gated legs: BUILD/REPAIR's real GitHub commit-back,
  and a real LLM producing the fix content. See `project/risks.yaml` RISK-18's
  `remediation_checklist` for the exact steps to close this in an environment with those
  credentials.

**Railway E2E attempt** (`feature/m4-final-railway-e2e-proof`, on top of the E2E attempt above):

- The two credential-gated legs identified above are understood to already be resolved on the
  project's Railway deployment (a real `GITHUB_TOKEN` and a real provider API key are configured
  there), so this attempt targeted Railway directly rather than this session's own environment.
- **Six distinct channels to reach Railway were checked, and none exist for this session:**
  (1) Railway CLI binary — not installed. (2) `RAILWAY_TOKEN`/`RAILWAY_API_TOKEN` environment
  variables — not set. (3) A documented Railway project ID or deployed URL anywhere in this
  repository — none found; `.env.example` and `buildPreviewUrl()`
  (`server/src/services/orchestrator/index.ts`) only encode the URL *pattern*
  (`https://<branch>-<project-id>.railway.app`), never a committed real value, by design (it's
  derived at runtime from `RAILWAY_PROJECT_ID`). (4) GitHub Actions workflows that might deploy
  to or reveal Railway — confirmed 0 workflows exist in this repo. (5) A GitHub Deployments-API
  tool that might surface a deployment's target URL — not exposed among this session's available
  GitHub MCP tools. (6) A Railway MCP connector for this account — none exists (checked via
  `ListConnectors`).
- **No request was made to any guessed Railway URL.** With zero of the six channels viable,
  attempting one would be speculation dressed as evidence, not real evidence — the same
  standard this document has held to since slice 1's "do not fake success" framing.
- **This is a different, more fundamental blocker than the credential-placeholder finding
  above.** The prior finding was "the credentials this session can see don't work." This
  finding is "this session cannot see Railway at all, regardless of what credentials exist
  there." Closing it requires either connecting a Railway-capable credential/connector to a
  future session, or running this specific check from an environment (human operator, or an
  agent) that already has direct Railway dashboard/CLI/API access.

The rest of this document (§2-§9) is unchanged from the original kickoff plan; §10-§11 are
updated below to reflect slice 4, both real E2E attempts, and the current verification status.

## 1. Current orchestrator QA placeholder — evidence

The QA step exists as a state transition with no real check behind it:

```ts
// server/src/services/orchestrator/index.ts:357-367
// ── Step 4: QA (placeholder) ──
await updateJobStatus(jobId, 'qa');
await logEvent(jobId, 'job.qa.started');
await appendLog(jobId, '[QA] Running lint...');
await appendLog(jobId, '[QA] Running build...');
await appendLog(jobId, '[QA] Running typecheck...');
await appendLog(jobId, '[QA] Running tests...');
// TODO(M3): Actually run npm lint/build/typecheck/test against the sandboxed
// checkout and persist real pass/fail output to the qa_runs table.
await logEvent(jobId, 'job.qa.complete');
await appendLog(jobId, '[QA] Complete.');
```

It always "passes" — `job.qa.complete` fires unconditionally, nothing reads `job.status` before
letting the job proceed to `preview`/`review`, and the `qa_runs` table (present since
`001_initial.sql`) has zero writers anywhere in `server/src` (confirmed by grep). This matches
`project/milestones.yaml` M4's existing notes and `project/risks.yaml` RISK-7.

**The deeper gap the TODO comment understates:** there is no sandboxed checkout to run anything
against. `server/src/services/github/index.ts:1-7`'s own header comment is explicit:

> The server runs on Railway with no persistent filesystem, so all repository operations
> (reading files, creating branches, committing, opening PRs) go through the GitHub REST API
> rather than local git commands.

The BUILD step (`runJobPipeline`, same file, ~lines 264-355) never clones or materializes the
repo on disk — it fetches a file tree and selected file contents via `github.getFileTree`/
`github.getFileContent` (GitHub Contents API calls), and commits generated files back the same
way (`github.upsertFile`/`github.deleteFile`), one file at a time. There is no `npm install`, no
`node_modules`, no working directory anywhere in the current pipeline. `server/nixpacks.toml`
only declares `nodejs_20` as a Nix package — no `git` CLI is guaranteed to be present in the
runtime image either. **M4 cannot just "add a shell command"; its first slice has to establish
an execution sandbox that doesn't exist today.**

## 2. Target verification flow

Extending the existing `runJobPipeline` state machine (`queued → planning → building → qa →
preview → review → pr_opened/shipped`, `001_initial.sql:17-18`), the QA step becomes:

```
BUILD (unchanged: commits files to featureBranch via GitHub API)
  │
  ▼
VERIFY  ── materialize featureBranch into a local working directory (new capability, §1)
        ── detect available checks from the target repo's package.json scripts (§4)
        ── run each detected check, capture exit code + stdout/stderr + duration
        ── persist one qa_runs row per attempt (§3)
        ── classify: all required checks passed → REVIEW
                     a required check failed AND repair attempts remain → REPAIR (§6)
                     a required check failed AND repair attempts exhausted → FAILED
                     a check errored (couldn't run, not "found problems") → FAILED, flagged distinctly from a real failure (§5)
  │
  ▼ (pass)                              │ (repair, bounded)
REVIEW (unchanged)                      └──▶ BUILD (re-invoked with error context) ──▶ VERIFY again
```

This mirrors the intended flow already documented (but not implemented) in
`docs/08-live-preview-runtime.md`'s "Error repair loop" (preview emits error → persist → create
verification failure → feed plan + files + exact error log + dependency manifest back to the
provider → minimal patch → remount → repair count increments) and `docs/05-agent-lifecycle.md`'s
state machine (`Building → Verifying → Building` on failure, `Verifying → Reviewing` on pass) —
both already describe this shape at the design-doc level; M4 is what actually builds it.

## 3. `qa_runs` data model audit

Current schema (`server/src/db/migrations/001_initial.sql:44-56`), unchanged since the first
migration and never written to:

```sql
CREATE TABLE IF NOT EXISTS qa_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  lint_passed       BOOLEAN,
  build_passed      BOOLEAN,
  typecheck_passed  BOOLEAN,
  tests_passed      BOOLEAN,
  lint_output       TEXT,
  build_output      TEXT,
  typecheck_output  TEXT,
  test_output       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Finding: this shape is already adequate for M4 slices 1-2, no migration required.** It's one
row per QA attempt (not one row per job), so the repair loop's multiple attempts are already
representable as multiple `qa_runs` rows ordered by `created_at` for the same `job_id` — no
`attempt_number` column is needed to know "this is retry 2", it's just `COUNT(*) WHERE job_id = X`.
The four `*_passed`/`*_output` column pairs map directly to the four checks the placeholder
already logs (lint/build/typecheck/test).

**Confirmed by slice 2 (2026-07-06):** `server/src/services/verification/verify.ts`'s
`persistQaRun` now writes all four `*_passed`/`*_output` pairs on one row with no migration —
this prediction held. One naming detail worth flagging for anyone querying the table directly:
the schema itself is inconsistent — `tests_passed` is plural but `test_output` is singular
(`001_initial.sql:50,54`); `verify.ts`'s `NewQaRun`/`QaRunRow` intentionally mirror this exactly
rather than "fixing" it, since fixing it would be a migration this slice doesn't need.

Gaps to fill **later, only if a slice actually needs them** (not upfront, per
`CLAUDE.md`'s "implement incrementally" and this project's lean-model precedent from
`adr/0007-manifest-persistence-data-model.md`):

- ~~No column distinguishing "check failed" from "check didn't run"~~ **Confirmed sufficient**:
  `*_passed = NULL` cleanly represents both "skipped" and "errored" (the distinction lives in
  the in-memory `CheckResult.outcome`, not persisted separately) — no column added.
- No `duration_ms`/`command` columns — useful for observability, not required for pass/fail
  gating. Candidate for slice 4 if the observability polish work wants to display them.
- No linkage to which repair attempt a `qa_runs` row belongs to beyond ordering — fine as long
  as the orchestrator only ever reads "the latest row for this job," which is all slice 1-2 need.

## 4. Commands to run per job

Blair operates on **arbitrary connected repositories** the user picks via the repo/branch picker
(`README.md:12-21`, `src/pages/Dashboard.jsx`'s repo selector) — not just this monorepo. So the
verification engine cannot hardcode `npm run lint`/`typecheck`/`test`/`build` as this repo's own
scripts; it must detect what the *target* repo actually defines, the same way
`src/components/dashboard/WebContainersPreview.jsx` already detects a `dev`/`start` script from
the target repo's `package.json` before booting a WebContainers preview (existing, proven pattern
in this codebase for the same category of problem).

Proposed detection order per job, reading the target repo's root `package.json` (already
fetchable via the existing `github.getFileContent`):

| Check | Script key checked | If absent |
|---|---|---|
| Install | (always run: `npm ci` if a lockfile is present in the tree, else `npm install`) | N/A — always attempted |
| Lint | `scripts.lint` | Skipped, recorded as `lint_passed = NULL` ("not applicable"), not a failure |
| Type check | `scripts.typecheck` | Skipped, same as above |
| Unit tests | `scripts.test` | Skipped, same as above |
| Build | `scripts.build` | Skipped, same as above |

This "skip if absent, never fabricate a pass" rule matters: a target repo with no `typecheck`
script must not silently report `typecheck_passed = true` — that would be a false verification
signal reaching `review`. Required checks (per `docs/05-agent-lifecycle.md`'s Verify table:
schema validation, lint, type check for TS, unit tests, preview boot are "Required") should only
gate the pipeline for checks that exist; a repo without TypeScript is not held to a type-check
gate it has no way to satisfy.

## 5. Failure model

Three distinct outcomes per check, not just pass/fail:

1. **Passed** — exit code 0.
2. **Failed** — the tool ran and reported problems (non-zero exit, real lint/type/test errors).
   This is the only outcome that should trigger the repair loop (§6).
3. **Errored** — the tool could not run at all: missing script (see §4, not actually an error),
   sandbox materialization failed, `npm install` failed (network/registry issue), a timeout was
   hit, or an unexpected exception in the verification engine itself. This must be surfaced
   distinctly from "Failed" — an infrastructure error is not evidence the *generated code* is
   wrong, and feeding a sandbox/network failure back to the provider as if it were a code review
   comment would produce nonsense repair attempts and waste the bounded retry budget in §6.

A job-level timeout per check (e.g. lint/typecheck/test capped at a few minutes, build capped
higher) is required so a hung command can't block a job indefinitely — exceeding it is an
**Errored** outcome, not a **Failed** one.

## 6. Repair-loop boundary

**Implemented (slice 3, 2026-07-06).** Final design, as built:

- Only a **Failed** outcome (§5) triggers a repair attempt. **Errored** outcomes go straight to
  `failed` job status with the raw error surfaced in `job_logs` — no repair attempt wasted on
  infrastructure problems. If a check errored *and* another check failed in the same attempt,
  the errored check still wins — no repair happens at all that round
  (`decideRepairAction()`, `server/src/services/orchestrator/index.ts`).
- A fixed maximum of 2 repair attempts per job, tracked by counting existing `qa_runs` rows for
  the job (§3) — no new column. `decideRepairAction(verification, qaRunsCountForJob,
  maxRepairAttempts)` is a pure function: `qaRunsCountForJob - 1` = repairs already used;
  `>= maxRepairAttempts` means the budget is exhausted.
- A repair attempt re-invokes the same provider-call-then-commit flow as BUILD
  (`generateAndCommitFiles()`, shared by both BUILD and REPAIR so slice 3 didn't duplicate the
  commit logic), with a distinct `REPAIR_STAGE_INSTRUCTIONS` prompt: the plan, every file
  generated so far (build + any prior repair, merged by path via `mergeGeneratedFiles()`), and
  the **exact** output of every check that failed (per `docs/08-live-preview-runtime.md`'s
  repair loop step 4 — "Blair receives plan, files, exact error log"), explicitly instructed to
  return the minimal fix only.
- After exhausting the repair budget, the job goes to `failed` with the last `qa_runs` row's
  output preserved — a human can read exactly what didn't pass, per `docs/12-testing-quality-gates.md`'s
  Definition of Done ("Generated files pass available checks" or the failure is documented).
- A structural iteration cap in the orchestrator's loop (one notch more permissive than the
  qa_runs-based cap) guarantees the loop terminates even if the row-counting logic were ever
  wrong — belt-and-suspenders, not the primary mechanism.
- Out of scope, still deferred: repairing *Preview* failures (docs/08's loop is about runtime/
  preview errors, a distinct signal from a build-time lint/typecheck/test failure) — that stays
  a separate, later slice once the QA-triggered loop is proven in production.

## 7. Logging/observability requirements

Reuse the two existing, already-proven channels — no new logging infrastructure:

- `job_logs` (via `appendLog`, `server/src/services/orchestrator/index.ts:83-90`) — human-readable
  progress lines the Dashboard already polls (`[VERIFY] Running lint...`, `[VERIFY] lint failed:
  12 problems`, `[REPAIR] Attempt 1/2: feeding lint failure back to Blair...`).
- `audit_events` (via `logEvent`, `server/src/services/audit/index.ts`) — structured lifecycle
  events (`job.verify.started`, `job.verify.check.failed` with `{ check, exitCode }`,
  `job.repair.attempted` with `{ attempt, maxAttempts }`, `job.verify.complete`), following the
  exact pattern every other pipeline step already uses.
- `qa_runs` rows themselves are the durable, queryable record of what actually ran (§3) — this
  is what unblocks M5's "verification summary attached" export requirement
  (`docs/12-testing-quality-gates.md:87`, Gate 4).

No new logging framework, no new table for logs — this is a case where the existing patterns are
already sufficient (matches the lean-model precedent from ADR-0007).

## 8. API surface changes

Minimal, additive, read-only for the first slices:

- `GET /api/jobs/:id/qa` (new) — returns the `qa_runs` rows for a job (most recent first),
  mirroring the existing `GET /api/jobs/:id/preview` pattern (`server/src/routes/jobs.ts:61-78`)
  and its `JobsRouterDeps` DI style. Lets the Dashboard show real verification output instead of
  nothing.
- No changes to `POST /api/jobs/:id/approve` in slice 1-2 — it already guards on
  `status === 'review'` (`server/src/routes/jobs.ts:85-90`), and a job that fails verification
  now simply never reaches `review`, so the existing guard is sufficient without modification.
- Out of scope for M4: a manual "re-run verification" or "retry repair" endpoint — not required
  by the M4 exit criteria (`docs/14-milestones.md:50-56`) and would need its own design pass on
  who's allowed to trigger it.

## 9. Tests required

Mirroring the existing test patterns in this codebase (`server/src/routes/*.test.ts` DI-stub
style, `server/src/services/**/*.test.ts` pure-function style):

- ~~**Sandbox materialization**~~ **Done** — `server/src/services/verification/workspace.test.ts`
  (5 tests): writes fetched files to disk incl. nested directories, cleanup removes the temp
  dir, a fetch failure propagates without leaving a temp dir behind, a path-escaping entry is
  refused, and a partial-write failure still cleans up.
- ~~**Check detection**~~ **Done** — `server/src/services/verification/checks.test.ts` covers
  `detectAvailableChecks` (5 tests: missing/unparsable/absent-scripts/mixed/non-string-value
  cases) and `readPackageJson` (2 tests).
- ~~**Command execution wrapper**~~ **Done, extended in slice 4** — same file,
  `runCommand`/`runInstall` (10 tests): passed (exit 0), failed (non-zero exit), errored
  (timeout via `killed`/`signal`), errored (spawn-level `ENOENT`), `npm ci` vs `npm install` argv
  selection, and install failures always classified `errored` (never `failed`) — each
  passed/failed/errored case now also asserts `durationMs` is a real measured number (slice 4).
- ~~**`qa_runs` persistence**~~ **Done, at the `runVerification` level** —
  `server/src/services/verification/verify.test.ts` (9 tests, extended in slice 2) asserts the
  exact `NewQaRun` shape (all four `*Passed`/`*Output` fields) passed to an injected
  `persistQaRun` for: all-skipped, partial-availability (only some checks defined), all-passed,
  a failed check blocking `ok` while others still run, an errored check blocking `ok` the same
  way, a skipped check never blocking `ok` on its own, `npm ci` vs `npm install` selection,
  install failure (available checks errored, unavailable stay skipped), and materialization
  failure (all four errored). Extended in slice 4: skipped checks assert `durationMs === null`;
  checks that actually ran (passed, failed, errored via install failure or materialization
  failure) assert the expected numeric-vs-`null` `durationMs` semantics described above.
- ~~**Repair-loop boundary**~~ **Done (slice 3)** — `server/src/services/orchestrator/index.test.ts`
  (10 new tests) covers `decideRepairAction()` directly (the pure decision function, since
  `runJobPipeline` itself has no DI harness to test end-to-end): proceeds with no repair when
  verification passed, a skipped check alone never triggers repair, a failed check triggers
  repair attempt 1, an errored check blocks repair even alongside a failed check, repairs are
  offered up to the cap of 2 then fail with `repair_budget_exhausted`, a full
  fail→repair→repair→proceed sequence, and multi-check failures are all reported (not just the
  first). Also covers `mergeGeneratedFiles()` (later files win on the same path) and
  `buildRepairUserMessage()` (includes the plan, files, and every failing check's exact output).
- ~~**`GET /api/jobs/:id/qa` route**~~ **Done (slice 2)** — `server/src/routes/jobs.test.ts`
  (4 new tests): 404 when the job is missing, empty array before any run exists, returns
  persisted rows most-recent-first, and a masked 500 on a DB error (mirroring the existing
  `GET /api/jobs` 500 test).
- ~~**No regression**~~ **Done** — `orchestrator/index.test.ts`'s pre-existing `buildPreviewUrl`/
  `pollPreviewReady` tests and the rest of `jobs.test.ts` pass unchanged; full server suite is
  118/118 (75 before slice 1, 101 after slice 1, 108 after slice 2, 118 after slice 3).

## 10. Incremental implementation slices

Each slice should land as its own small, independently-verified PR — no slice should require the
next one to already exist to be mergeable and useful.

1. ~~**Slice 1 — Sandbox spike + single-check execution.**~~ **Done (2026-07-06,
   `feature/m4-verification-slice-1`).** Resolved via `github.getRepoFiles` (reconstructing from
   the existing Contents/Trees API fetcher, not a tarball or local `git clone` — no new `git`
   CLI dependency needed). `npm install`/`npm ci` + `npm run lint` execute via injectable
   `execFile` (`server/src/services/verification/checks.ts`) against the materialized workspace
   (`workspace.ts`), tied together and persisted to a real `qa_runs` row by
   `verify.ts`/`runVerification`. Confirmed: no repair loop, no gating — a lint failure still
   proceeds to `preview`, matching this slice's intentionally low-risk scope. **Not yet
   confirmed against a real Railway deployment** (this environment has no live Postgres/GitHub
   token/Railway container to run an actual job end-to-end against) — verified via the 26 new
   unit tests (§9) with injected fakes for the GitHub fetch, `execFile`, and DB persistence
   layers, plus `tsc`/build passing. A real end-to-end run against a live job is still
   recommended before treating slice 1 as fully proven in production.
2. ~~**Slice 2 — All four checks, still no repair loop.**~~ **Done (2026-07-06,
   `feature/m4-verification-slice-2`).** `verify.ts` now runs all four checks, each
   independently detected/skippable (§4); a **Failed** or **Errored** outcome now blocks
   progression to `review` (the orchestrator throws, which the existing `createJob`.catch()
   marks `failed` — no new manual status-setting path introduced). Shipped in the same PR as
   `GET /api/jobs/:id/qa` (§8), so a failed job's output is visible. **Not yet confirmed against
   a real Railway deployment** — same caveat as slice 1 (§1), verified via unit tests with
   injected fakes only.
3. ~~**Slice 3 — Bounded repair loop.**~~ **Done (2026-07-06, `feature/m4-verification-slice-3`).**
   The `Failed → REPAIR → VERIFY` cycle (§2/§6) is implemented: `decideRepairAction()` decides
   proceed/repair/fail; a `Failed` (not `Errored`, not `skipped`-only) outcome repairs up to 2
   attempts, capped by counting `qa_runs` rows; `generateAndCommitFiles()` is shared by BUILD and
   REPAIR so the repair attempt reuses the exact same provider-call-then-commit flow, with a
   dedicated `REPAIR_STAGE_INSTRUCTIONS` prompt asking for a minimal fix. **Not yet confirmed
   against a real Railway deployment / real provider** — same caveat as slices 1-2, verified via
   10 new unit tests against the pure decision function plus `tsc`/build passing.
4. ~~**Slice 4 — Observability polish + remaining Verify-phase checks.**~~ **Done (2026-07-06,
   `feature/m4-verification-slice-4`).** Structured `job.qa.*`/`job.repair.*` audit events already
   existed as of slice 3; slice 4's observability work is the in-memory `durationMs` field on
   `CheckResult` (described in the slice 4 summary above), not new events. The three open scope
   questions (preview-error-triggered repair, accessibility smoke, license checks) are now
   explicit, final decisions — all three deferred — recorded in
   `adr/0008-m4-verification-scope-boundaries.md` rather than
   left as an open evaluation.

Slice 1 is deliberately the smallest possible vertical slice that produces one real, persisted,
non-placeholder QA signal — everything after it is additive.

## 11. Acceptance criteria

Per-slice, plus the milestone-level criteria they roll up to
(`docs/14-milestones.md:50-56`, `project/milestones.yaml` M4):

- **Slice 1 done when:** a real `npm run lint` (or equivalent detected script) executes against
  a materialized copy of a job's feature branch, and its actual pass/fail + output is persisted
  to a real `qa_runs` row — not a log line, an actual row with `lint_passed` set from a real exit
  code. **Status: code complete, verified by unit tests with injected fakes (§9), not yet by a
  manual run against a real job.** No live Postgres/GitHub token/Railway environment was
  available in this session to run an actual job end-to-end; the "known-bad lint error → real
  `lint_passed = false` row" manual check from the original acceptance bar is still outstanding
  and should be done in a real environment before slice 2 builds further on top of this.
- **Slice 2 done when:** all four checks run (or are cleanly skipped per §4), a **Failed**
  outcome prevents `review`, and `GET /api/jobs/:id/qa` returns the real row(s). **Status: code
  complete, verified by unit tests (§9), not yet by a manual run against a real job** — same
  outstanding manual-verification caveat as slice 1.
- **Slice 3 done when:** a job with a known, fixable lint error is repaired within the bounded
  attempt count and reaches `review`; a job with an unfixable error exhausts the budget and
  reaches `failed` with the last failure's output intact. **Status: code complete
  (`decideRepairAction()`'s branching is directly unit-tested — proceed/repair/fail-errored/
  fail-exhausted/multi-check, 10 tests), but the end-to-end claim ("a known, fixable lint error
  is repaired... and reaches review") has NOT been demonstrated against a real provider + real
  job.** This is the specific outstanding gap flagged for M4's second exit criterion below — the
  repair loop's *mechanics* are tested, but no real LLM has actually produced a fix that made a
  previously-failing check pass in this session (no live Postgres/GitHub token/provider API key
  available). This should be the first thing verified manually before M4 is considered done.
- **Slice 4 done when:** the four open scope questions (preview-error repair, accessibility
  smoke, license checks, structured timing) have explicit, evidence-backed, final decisions, and
  `durationMs` is available on every in-memory `CheckResult`. **Status: done.**
  `adr/0008-m4-verification-scope-boundaries.md` (Accepted) records all four decisions;
  `server/src/services/verification/checks.ts`'s `CheckResult.durationMs` is populated by
  `runCommand`/`runInstall` and covered by tests asserting a numeric value for passed/failed/
  errored checks and `null` for skipped/never-invoked ones (§9). Slice 4 also produced real,
  partial progress on the slice 1-3 "not yet run against a real job" gap: the `qa_runs`
  persistence layer was exercised against a genuine local Postgres instance for the first time
  this session — but the GitHub-API and real-provider legs (a working `GITHUB_TOKEN`, a provider
  API key) were still unavailable, so this remains a documented blocker, not a demonstrated
  success.
- **Real E2E verification attempt done when:** a real job is driven through the real HTTP API
  against a real Postgres instance, and the exact point of any remaining failure is directly
  observed (not inferred) and documented. **Status: done, blocker precisely identified.** A real
  job run via `POST /api/generations` reached BUILD and failed with a genuine `401 Bad
  credentials` from the real GitHub API at branch creation — captured from the running server's
  own logs, never reaching QA (zero `qa_runs` rows, confirmed via direct SQL). Separately, the
  verification+repair mechanics were proven against genuinely real `npm install`/`npm run lint`
  execution and real Postgres persistence, with `decideRepairAction()` fed a real (not
  hand-built) `VerificationResult` at both the failing and passing stages. The two substitutions
  used (an injected `fetchRepoFiles` reading a local demo directory instead of calling the real
  GitHub API, and a manual file fix standing in for a real LLM-produced patch) were necessary
  specifically because this environment's `GITHUB_TOKEN` and provider API keys are confirmed
  non-functional/absent — not a choice to skip realism elsewhere. **Remaining gap, remediable
  with credentials this environment doesn't have:** a working GitHub PAT for BUILD/REPAIR's real
  commit-back, and a real provider API key for genuine fix content — see
  `project/risks.yaml` RISK-18's `remediation_checklist`.
- **Railway E2E attempt done when:** the proof is run against Railway (where real credentials
  are understood to already exist), or the exact reason it couldn't be is documented with
  evidence. **Status: done, blocked before it could start.** Six distinct channels to reach
  Railway from this session were checked (CLI, API token env vars, a documented deployment URL,
  GitHub Actions, GitHub's Deployments API, a Railway MCP connector) and none exist — see the
  "Railway E2E attempt" section above and `project/risks.yaml` RISK-18's
  `railway_access_prerequisites`. No request was made to a guessed URL. This is a categorically
  different blocker than the credential-placeholder one above: it isn't that the reachable
  credentials are bad, it's that Railway itself is unreachable from this session by any means.
- **M4 milestone done when** (mirrors `project/milestones.yaml` M4's three exit criteria):
  "Verification failures produce repair context" — **met**: `buildRepairUserMessage()` gives the
  provider the plan, generated files, and exact failing output every repair attempt
  (`server/src/services/orchestrator/index.ts`, `server/src/services/orchestrator/index.test.ts`).
  "Repair fixes at least one known import/build error" — **not yet met**: requires demonstrating
  against a real, reproducible case with a real provider, not just asserting the mechanism
  exists (see the slice 3 status note above) — narrowed further by the real E2E attempt above
  (the verification+repair *mechanics* are now proven against genuine tool execution and
  persistence; only the real-GitHub-commit and real-LLM-fix legs remain unverified, and the exact
  reason why — a genuine 401 from the real application, not a hypothetical — is now documented).
  "Reviewer can approve/request changes" — already partially true today
  (`server/src/routes/jobs.ts:81-96` approve path exists); a `request-changes` counterpart may
  be its own small slice or explicitly deferred to M5's review-decision work, per the M4/M5
  boundary in `docs/engineering/ENGINEERING_MASTER_PLAN.md` §5.
