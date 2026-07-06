# M4 Verification Engine — Kickoff Plan

Status: **Slice 2 implemented (2026-07-06).** Owner: Full-stack/QA.

This plan grounds M4 ("Verification / Repair Loop") in what is actually running today, per
`docs/engineering/ENGINEERING_MASTER_PLAN.md` §3/§5 and `project/milestones.yaml` M4. It
originally shipped as planning-only; slices 1-2 (§10) are now implemented.

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
- No repair loop yet (slice 3) — a failing job now stops at `failed` instead of being repaired.
- No `qa_runs` migration — the table already had all the columns needed (confirmed in §3 below).
- 7 new/updated tests (108/108 server tests passing, up from 101) — see §9.

The rest of this document (§2-§11) is unchanged from the original kickoff plan and remains the
reference for slices 3-4.

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

Scope, kept intentionally narrow for the first implementation:

- Only a **Failed** outcome (§5) triggers a repair attempt. **Errored** outcomes go straight to
  `failed` job status with the raw error surfaced in `job_logs` — no repair attempt wasted on
  infrastructure problems.
- A fixed, small maximum repair attempts per job (e.g. 2), tracked by counting existing
  `qa_runs` rows for the job (§3) — no new column needed to enforce the cap.
- A repair attempt re-invokes the existing BUILD step's provider call
  (`server/src/services/orchestrator/index.ts` build stage,  ~line 300's `provider.complete(...)`)
  with additional context appended: the plan, the previously generated files, and the **exact**
  failing check's output (per `docs/08-live-preview-runtime.md`'s repair loop step 4 — "Blair
  receives plan, files, exact error log, dependency manifest"). This reuses the existing BUILD
  code path rather than inventing a second "repair provider call" path.
- After exhausting the repair budget, the job goes to `failed` with the last `qa_runs` row's
  output preserved — a human can read exactly what didn't pass, per `docs/12-testing-quality-gates.md`'s
  Definition of Done ("Generated files pass available checks" or the failure is documented).
- Out of scope for M4 slice 1-2: repairing *Preview* failures (docs/08's loop is about runtime/
  preview errors, which is a distinct signal from a build-time lint/typecheck/test failure) —
  that stays a separate, later slice once the QA-triggered loop is proven.

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
- ~~**Command execution wrapper**~~ **Done** — same file, `runCommand`/`runInstall` (9 tests):
  passed (exit 0), failed (non-zero exit), errored (timeout via `killed`/`signal`), errored
  (spawn-level `ENOENT`), `npm ci` vs `npm install` argv selection, and install failures always
  classified `errored` (never `failed`).
- ~~**`qa_runs` persistence**~~ **Done, at the `runVerification` level** —
  `server/src/services/verification/verify.test.ts` (9 tests, extended in slice 2) asserts the
  exact `NewQaRun` shape (all four `*Passed`/`*Output` fields) passed to an injected
  `persistQaRun` for: all-skipped, partial-availability (only some checks defined), all-passed,
  a failed check blocking `ok` while others still run, an errored check blocking `ok` the same
  way, a skipped check never blocking `ok` on its own, `npm ci` vs `npm install` selection,
  install failure (available checks errored, unavailable stay skipped), and materialization
  failure (all four errored).
- **Repair-loop boundary** — not yet, slice 3 (§6/§10).
- ~~**`GET /api/jobs/:id/qa` route**~~ **Done (slice 2)** — `server/src/routes/jobs.test.ts`
  (4 new tests): 404 when the job is missing, empty array before any run exists, returns
  persisted rows most-recent-first, and a masked 500 on a DB error (mirroring the existing
  `GET /api/jobs` 500 test).
- ~~**No regression**~~ **Done** — `orchestrator/index.test.ts` (`buildPreviewUrl`/
  `pollPreviewReady`) and the rest of `jobs.test.ts` pass unchanged; full server suite is
  108/108 (up from 75 before slice 1, 101 after slice 1).

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
3. **Slice 3 — Bounded repair loop.** Add the `Failed → BUILD → VERIFY` cycle from §2/§6, capped
   at a small fixed attempt count, with the exact failing output fed back into the existing BUILD
   provider call.
4. **Slice 4 — Observability polish + remaining Verify-phase checks.** Structured
   `job.verify.*`/`job.repair.*` audit events (§7) if slice 1-3 didn't already add them
   incrementally; evaluate whether preview-error-triggered repair (docs/08's original loop,
   distinct from build-time QA) and the "Should"-tier checks from `docs/05-agent-lifecycle.md`
   (accessibility smoke, license check) are in scope for M4 or deferred to a later milestone —
   this should be an explicit decision recorded before slice 4 starts, not assumed.

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
  reaches `failed` with the last failure's output intact.
- **M4 milestone done when** (mirrors `project/milestones.yaml` M4's three exit criteria):
  "Verification failures produce repair context" (slice 3), "Repair fixes at least one known
  import/build error" (demonstrated against a real, reproducible case, not asserted), and
  "Reviewer can approve/request changes" — already partially true today
  (`server/src/routes/jobs.ts:81-96` approve path exists); a `request-changes` counterpart may be
  its own small slice or explicitly deferred to M5's review-decision work, per the M4/M5
  boundary in `docs/engineering/ENGINEERING_MASTER_PLAN.md` §5.
