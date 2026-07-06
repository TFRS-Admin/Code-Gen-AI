# Engineering Master Plan (EMP)

Status: **Baseline** · Owner: Blair / Code-Gen-AI engineering · Last updated: 2026-07-05

This is the canonical, evidence-based project-management document for `Code-Gen-AI`. It is
paired with the machine-readable state in `project/*.yaml`. Anything stated here as "complete"
or "in progress" is backed by a file/line citation from this repository as of the commit this
was written against (`0e8b057`, branch `claude/code-gen-ai-baseline-blzoj2`). Where the repo
does not provide direct evidence, the status is marked `unknown` or `needs-audit` rather than
assumed.

**Update (2026-07-05, M3.3 prep):** Open Question 2 (data-model target) is resolved by
`adr/0007-manifest-persistence-data-model.md` — M3.3 manifest persistence builds on the
existing lean `jobs`/`plans`/`qa_runs` schema, adding a minimal `component_manifests`-style
table, rather than migrating to the full ERD in `docs/10-data-model.md`. The full data-model
migration is deferred until after M5 per the ADR.

**Update (2026-07-05, M3.3 implementation):** ADR-0007 is now **Accepted**. M3.3 is
implemented: `server/src/db/migrations/005_component_manifests.sql` adds the
`component_manifests` table; `server/src/services/harvester/manifest-store.ts` builds,
validates (via a Zod schema mirroring `contracts/component-manifest.schema.json`), and
persists manifests; `server/src/routes/adapt.ts`'s `/component` and `/batch` endpoints now
build and persist one manifest per adaptation. 75 server tests pass (up from 61 at baseline),
covering manifest construction, schema validation (accept + reject cases), ID-prefix format,
and a manifest↔row mapping round-trip. See §3 (M3.3), §10 (Open Questions 2 and 4), and §11
below for the updated status, and `project/risks.yaml` RISK-14 for the one known, documented
gap this introduces (the manifest `score` field is a fixed placeholder — candidate scoring,
TICKET-029, is still not implemented). Merged to `main` via PR #23.

**Update (2026-07-05, M4 kickoff planning):** `docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md`
(branch `feature/m4-verification-engine-plan`, planning only — no product code changed) scopes
M4 into 4 incremental slices. Key finding: `server/src/services/github/index.ts:1-7` confirms
there is **no local checkout/sandbox execution capability today** — all repo operations go
through the GitHub REST API, so M4 slice 1 must first establish a way to materialize a job's
branch and run commands against it, before any real lint/build/typecheck/test check can run.
`qa_runs`' existing schema needs no migration for slices 1-2. See `project/risks.yaml` RISK-15
(the sandbox gap) and RISK-16 (must not fabricate a pass for a check a target repo doesn't
define).

**Update (2026-07-06, M4 slice 1 implemented):** On `feature/m4-verification-slice-1` (from
`feature/m4-verification-engine-plan`): `server/src/services/verification/{workspace,checks,verify}.ts`
implement real workspace materialization (via the existing `github.getRepoFiles`), package-script
detection, and injectable/timeout-enforced command execution with a Passed/Failed/Errored/Skipped
classification. `server/src/services/orchestrator/index.ts`'s QA step now runs a real `npm run
lint` (after `npm ci`/`npm install`) against a materialized copy of the feature branch and
persists one real `qa_runs` row (`lint_passed`/`lint_output`) — `build`/`typecheck`/`test`
remain `NULL` (slice 2), there is still no repair loop (slice 3), and the job still proceeds to
`preview` regardless of the lint outcome (no gating yet, matching slice 1's deliberately narrow
scope). RISK-15 and RISK-16 from the kickoff plan are now mitigated by this implementation. 26
new tests, all injecting fakes for the GitHub fetch/child-process/DB layers — **no live
Postgres/GitHub token/Railway environment was available in this session to run an actual job
end-to-end**, so slice 1's original "manual run against a real job" acceptance bar is still
outstanding (see `docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md` §11). 101/101 server tests
passing (up from 75).

**Update (2026-07-06, M4 slice 2 implemented):** On `feature/m4-verification-slice-2` (from
`feature/m4-verification-slice-1`): `verify.ts`'s `runVerification()` now runs all four checks
(`lint`/`build`/`typecheck`/`test`), each independently detected/skippable, and persists a full
`qa_runs` row (no migration needed — confirmed by `docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md`
§3's prediction). The orchestrator's QA step now **gates the pipeline**: a `failed` or `errored`
check throws, which the existing `createJob`'s `.catch()` turns into `status='failed'` (reusing
the codebase's existing error-propagation convention rather than adding a new one); a `skipped`
check never blocks progression. New `GET /api/jobs/:id/qa` route returns a job's `qa_runs`
history. 7 new/updated tests (108/108 server tests passing, up from 101) — same outstanding
"manual run against a real job" caveat as slice 1 (no live Postgres/GitHub token/Railway in this
session).

**Update (2026-07-06, M4 slice 3 implemented):** On `feature/m4-verification-slice-3` (from
`feature/m4-verification-slice-2`): a bounded repair loop. `decideRepairAction()` (new, pure,
exported from `server/src/services/orchestrator/index.ts`) decides proceed/repair/fail from a
verification result and a `qa_runs` row count — a `failed` check gets up to 2 repair attempts;
an `errored` check is never repaired (fails immediately, same as slice 2); a `skipped` check
never blocks. A repair attempt reuses the exact same provider-call-then-commit flow as BUILD
(`generateAndCommitFiles()`, extracted so BUILD and REPAIR share it) with a dedicated prompt
(`REPAIR_STAGE_INSTRUCTIONS`) carrying the plan, every file generated so far, and the exact
failing output, asking for a minimal fix. No `qa_runs` migration. 10 new tests against the pure
decision function (118/118 server tests passing, up from 108) — **the repair loop's mechanics
are unit-tested, but no real LLM has actually produced a fix that turned a failing check into a
passing one in this session** (no live provider/Postgres/GitHub token available) — this is the
specific outstanding gap before M4's "repair fixes at least one known import/build error" exit
criterion can be marked met. See `docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md` §6/§10/§11.

This document does not replace the design/spec suite in `docs/00-documentation-map.md` — it
tracks *status and sequencing* against that suite, and records where the running code has
diverged from it.

## 1. Project mission

Code-Gen-AI ("Blair") is orchestration infrastructure that sits between an LLM provider
(OpenAI/Anthropic/mock) and a real GitHub repository, so a user can go from a prompt to a
reviewed pull request without hand-copying code or fighting consumer chat-UI limits
(`README.md:6-21`). The product is not a one-shot "generate an app from a prompt" tool — it is
built around a disciplined, plan-first lifecycle: define → plan → build (harvest components,
adapt to the TFRS design system, generate files) → verify → review → ship
(`docs/01-main-spec.md:7-15`, `docs/00-documentation-map.md:7-15`, `CLAUDE.md`).

The MVP workflow (`README.md:12-21`): connect a GitHub repo → select a base branch → submit a
prompt → agent creates a feature branch → implements in a sandbox → runs QA → opens a live
preview → shows a diff → opens a PR.

## 2. Current architecture summary

### 2.1 What actually runs today

| Layer | Implementation | Evidence |
|---|---|---|
| Frontend | React 18 + Vite 6, Tailwind, Radix-based local UI kit under `src/components/ui`, TanStack Query, `react-router-dom` | `package.json:15-104`, `src/components/ui/` |
| Pages | Dashboard (sidebar + chat + preview), Assistant, Projects, Settings, ComponentHarvester | `src/pages/*.jsx` |
| Instant preview | `@webcontainer/api` boots the selected repo client-side (`npm install && npm run dev\|start`), no server deploy | `README.md:31-61`, `adr/0006-webcontainers-instant-preview.md`, `docs/08-live-preview-runtime.md:7-19` |
| Job preview | Railway branch deploy, polled and shown in `PreviewPanel` | `server/src/routes/jobs.ts:10-28`, `server/src/services/orchestrator/index.ts:369-390` |
| Backend | Express/TypeScript app under `server/src` | `server/src/index.ts` |
| Routes mounted | `/api/health`, `/api/generations` (create job + chat), `/api/jobs`, `/api/github`, `/api/repos`, `/api/registry`, `/api/adapt` | `server/src/index.ts:23-29` |
| Orchestrator | Single state machine driving a job through `queued → planning → building → qa → preview → review → pr_opened/shipped`, or `failed`/`cancelled` | `server/src/db/migrations/001_initial.sql:17-18`, `server/src/services/orchestrator/index.ts:242,265,358,370,393` |
| Persistence | Postgres: `jobs`, `plans`, `qa_runs`, `provider_calls`, `audit_events`, `registry_components`, `component_manifests` | `server/src/db/migrations/001_initial.sql`, `004_registry_components.sql`, `005_component_manifests.sql` |
| Provider gateway | Mock / OpenAI / Anthropic adapters behind one `Provider` interface, server-side only | `server/src/services/providers/index.ts:1-60`, `.env.example:11-19` |
| Component harvester | Internal + Shadcn registry adapters, TFRS class adapter, `/api/registry` and `/api/adapt` routes | `server/src/services/harvester/registry.ts`, `adapters/{internal,shadcn}.ts`, `tfrs-adapter.ts`, `routes/registry.ts`, `routes/adapt.ts` |
| GitHub integration | Repo/branch listing, file commits, PR creation on approval | `server/src/services/github/index.ts`, `server/src/routes/{github,repos}.ts`, orchestrator `approveJob` (`server/src/services/orchestrator/index.ts:407-435`) |
| Audit trail | Append-only `audit_events`, written via `logEvent()` at each lifecycle step | `server/src/services/audit/index.ts`, calls throughout `orchestrator/index.ts` |
| Deployment | Railway for both frontend and backend (`Procfile`, `railway.toml`, `nixpacks.toml`, `Caddyfile`; `server/railway.toml`, `server/nixpacks.toml`) | repo root, `server/` |

### 2.2 Where the running code has diverged from the design docs

These are factual gaps between `docs/*` (the target architecture) and what is implemented,
found while auditing for this baseline. They are not judgments — they are inputs to the
roadmap and backlog:

1. **Preview tech substitution.** `docs/08-live-preview-runtime.md` and ADR-0002 specify
   Sandpack as the MVP preview layer. There is no Sandpack dependency or code anywhere in the
   repo (`grep` for `sandpack` returns nothing). The team shipped WebContainers + Railway
   branch deploys instead (ADR-0006), which is a superset in capability. `docs/08` documents
   both surfaces but still calls Sandpack "the MVP recommendation" — the doc should be updated
   to reflect ADR-0006 as the actual, shipped decision.
2. **Data model is leaner than the ERD in `docs/10-data-model.md`.** The doc specs `users`,
   `projects`, `generation_requests`, `generation_plans`, `component_sources`,
   `harvested_components`, `generated_artifacts`, `preview_sessions`, `verification_runs`,
   `review_decisions`, `export_jobs`. The actual schema (`server/src/db/migrations/001-004`)
   implements a pragmatic subset: `jobs`, `plans`, `qa_runs`, `provider_calls`,
   `audit_events`, `registry_components`. There is no per-user/per-project model, no
   `harvested_components`/`component_sources` tables, and no `export_jobs` table.
3. **API surface differs from `docs/09-api-contracts.md`.** The doc specs a full
   `/api/generations/{id}/plan`, `/plan/approve`, `/build`, `/preview-sessions`, `/verify`,
   `/review`, `/exports` resource lifecycle. The actual API is job-centric:
   `POST /api/generations` (create job), `POST /api/generations/chat` (pre-lifecycle
   consultation), and `/api/jobs/:id`, `/api/jobs/:id/preview`, `/api/jobs/:id/approve`
   (`server/src/routes/generations.ts`, `server/src/routes/jobs.ts`). There is no endpoint to
   revise/re-approve a plan independently, no dedicated verification endpoint, and no export
   endpoint.
4. **QA step is a placeholder.** The orchestrator's `qa` phase only appends log lines
   (`"[QA] Running lint..."`, etc.) — it does not actually invoke lint/build/typecheck/test
   against the sandboxed checkout, and never writes to the `qa_runs` table despite that table
   existing since the first migration. This is called out in-code:
   `server/src/services/orchestrator/index.ts:357-367` (`// TODO(M3): Actually run npm
   lint/build/typecheck/test against the sandboxed checkout and persist real pass/fail output
   to the qa_runs table.`). This means M4 (Verification/Repair Loop) has no working
   foundation yet beyond the empty table and the log-line placeholder.
5. **`provider_calls` table is unused.** The table has existed since `001_initial.sql`, but no
   code in `server/src` inserts into it — provider call logging (docs `09-api-contracts.md:194-208`)
   is specified but not implemented.
6. **No plan schema validation at runtime.** `contracts/plan.schema.json` exists, but nothing
   in `server/src/services/orchestrator/index.ts` validates the provider's JSON plan output
   against it (no `zod`/schema parse of the plan found). The plan is only consumed loosely for
   `file_manifest` (`server/src/services/orchestrator/index.ts:111-123`).
7. ~~**No component manifest persistence.**~~ **Resolved (M3.3).** `server/src/routes/adapt.ts`
   now builds a manifest per adaptation via `server/src/services/harvester/manifest-store.ts`
   and persists it to `component_manifests` (`server/src/db/migrations/005_component_manifests.sql`).
   See `adr/0007-manifest-persistence-data-model.md`.
8. **Branching model mismatch — update (2026-07-05).** `CLAUDE.md`, `docs/04-repository-contracts.md:116`,
   and the Cursor rules all say work should branch from `develop`. A `develop` branch now
   exists on the remote (it did not at baseline time), but it is **not** the active integration
   branch in practice: `git diff origin/main origin/develop --stat` shows 112 files and ~12,500
   lines diverged, `develop`'s history ends at an early scaffold commit and contains none of
   M0-M3.3's work, and `list_pull_requests` with `base:develop` returns zero results — every
   merged PR (#14 through #23) targeted `main`. `main` is the de facto active integration
   branch; `develop` is a stale, disconnected branch, not an alternative target. Still an open
   decision below whether to delete/resync `develop` or keep both.
9. **Vestigial frontend dependencies.** `@stripe/react-stripe-js`, `@stripe/stripe-js`, and
   `three` are declared in `package.json` but have zero references anywhere in `src/`
   (`grep -rl "stripe\|Stripe\|three\b" src` returns nothing). Likely carried over from a
   starter template; no ADR or doc references a billing or 3D feature.

## 3. Current milestone status

Source of truth for the target list: `docs/14-milestones.md`. Status below reflects the
milestone state provided for this baseline plus repo evidence found during the audit; see
`project/milestones.yaml` for the machine-readable version with per-criterion evidence.

| Milestone | Status | Evidence summary |
|---|---|---|
| M0 — Documentation Baseline | **Complete** | Full doc suite (18 files under `docs/`), 6 ADRs, 5 contracts, backlog, AI-tool instructions all committed. |
| M1 — Plan-First API | **Complete** | `POST /api/generations` persists a `jobs` row; orchestrator calls the provider to produce a plan and persists it to `plans` before building (`server/src/services/orchestrator/index.ts:242-265`). Caveat: plan output is not validated against `contracts/plan.schema.json` (§2.2.6) — functionally complete, but the "invalid plan rejected" exit criterion in `docs/14-milestones.md:29` has no enforcement evidence. |
| M2 — Live Preview | **Complete** | Two working preview surfaces (WebContainers instant preview, Railway job preview) per ADR-0006. Supersedes the Sandpack plan in ADR-0002/docs/08 (§2.2.1). |
| M3.1 — Registry | **Complete** | `server/src/services/harvester/registry.ts`, internal + Shadcn adapters, `registry_components` table, `/api/registry` route, `registry.test.ts` passing. |
| M3.2 — Component Adaptation | **In progress** | `tfrs-adapter.ts` + `/api/adapt` route implement class-level TFRS adaptation and are unit-tested (`tfrs-adapter.test.ts`, `adapt.test.ts`). Not done: no scoring persistence, no `ComponentHarvester.jsx` end-to-end wiring audit performed, no manifest emitted (that's M3.3). |
| M3.3 — Manifest Persistence | **Complete** | `adr/0007-manifest-persistence-data-model.md` (Accepted): lean-schema decision. `server/src/db/migrations/005_component_manifests.sql` adds the table; `server/src/services/harvester/manifest-store.ts` builds/validates/persists manifests; `server/src/routes/adapt.ts` wires it into `/component` and `/batch`. Tests: `manifest-store.test.ts`, updated `adapt.test.ts` (75/75 server tests passing). Caveat: migration not executed against a live Postgres in this environment (same gap as `registry_components`); `score` is a fixed placeholder pending candidate scoring (TICKET-029, RISK-14). |
| M4 — Verification / Repair Loop | **In progress (slice 3 of 4)** | `qa_runs` has a real writer for all four checks and a bounded repair loop: `server/src/services/verification/{workspace,checks,verify}.ts` + orchestrator wiring run lint/build/typecheck/test, gate on failed/errored, and now repair a `failed` check up to 2x (`decideRepairAction()`) before giving up. `errored` never repairs. `GET /api/jobs/:id/qa` exposes results. Repair mechanics unit-tested; not yet demonstrated fixing a real failure with a real provider. See `docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md`. |
| M5 — Review / Export / PR Workflow | **Planned (partially pre-built)** | A minimal review→approve→PR path already exists (`jobs.status = 'review'`, `POST /api/jobs/:id/approve` opens a PR — `server/src/services/orchestrator/index.ts:407-435`). Missing: reviewer checklist/`review_decisions`, ZIP/patch export, `export_jobs`, checksums, export approval guard. |
| M6 — Production Hardening | **Planned (not started)** | No auth/role checks, rate limiting, or the rest of the `docs/11-security-threat-model.md:107-117` checklist found in `server/src`. |

## 4. Epics

Mirrors `backlog/mvp-epics.md` (TICKET-001..036), re-grouped against current milestones. Full
per-ticket status is in `project/backlog.yaml`.

- **EPIC-1 Documentation & Contracts** (M0) — complete.
- **EPIC-2 Backend Foundation** (M1) — complete (Express skeleton, middleware, migrations,
  request persistence, audit service).
- **EPIC-3 Provider Gateway** (M1) — mostly complete (interface + mock/OpenAI/Anthropic
  adapters exist; provider-call logging and plan-schema validation are gaps, see §2.2.5-6).
- **EPIC-4 Orchestration** (M1/M4) — partially complete (state machine and lifecycle audit
  events work; no repair-attempt tracking, no SSE streaming — the frontend gets state via
  `job_logs` polling, not `/events`).
- **EPIC-5 Live Preview** (M2) — complete, via WebContainers + Railway rather than Sandpack.
- **EPIC-6 Component Harvester** (M3) — in progress; M3.1 and M3.3 complete, M3.2 in progress
  (see M3.1/M3.2/M3.3 above).
- **EPIC-7 Verification & Repair** (M4) — not started beyond an empty table and a log-only
  placeholder step.
- **EPIC-8 Review & Export** (M5) — partially started (approve → PR); export packaging not
  started.
- **EPIC-9 Production Hardening** (M6) — not started.

## 5. Roadmap

Sequenced by dependency, not calendar time (see `project/roadmap.yaml` for the machine-readable
form):

1. **M3.2 completion** — finish TFRS component adaptation: confirm `ComponentHarvester.jsx` is
   wired end-to-end to `/api/registry` + `/api/adapt`, decide whether candidate scoring
   (`docs/06-component-harvester.md:49-65`) is in scope before M3.3 or deferred.
2. ~~**M3.3 Manifest Persistence**~~ **Done** — `component_manifests` table
   (`server/src/db/migrations/005_component_manifests.sql`), manifest-generation service
   (`server/src/services/harvester/manifest-store.ts`) satisfying
   `contracts/component-manifest.schema.json`, wired into the `/api/adapt` response path
   (`server/src/routes/adapt.ts`). Candidate scoring (previously item 1's open question) is
   still deferred — the manifest `score` field ships as a fixed placeholder (RISK-14).
3. **M4 Verification / Repair Loop** — plan written
   (`docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md`, 4 incremental slices); **slices 1-3
   done** (all four checks, `qa_runs` persistence, pipeline gating, `GET /api/jobs/:id/qa`,
   bounded repair loop feeding failures back to the provider per
   `docs/08-live-preview-runtime.md:134-142`, `server/src/services/verification/`). Remaining:
   slice 4 (observability polish); also outstanding — demonstrating the repair loop actually
   fixing a real failure against a real provider (not yet done in any session).
4. **M5 Review / Export / PR Workflow** — formalize the review step (checklist, decision
   record), add ZIP/Git-patch export with checksums and an export-approval guard
   (`docs/12-testing-quality-gates.md:84-91`).
5. **M6 Production Hardening** — auth/roles, rate limiting, secret-scanning in CI, the rest of
   `docs/11-security-threat-model.md:107-117`.

Cross-cutting, can be picked up opportunistically alongside the above: plan-schema validation
(§2.2.6), provider-call logging (§2.2.5), resolving the `develop`-branch doc mismatch (§2.2.8),
removing or justifying the unused Stripe/`three` dependencies (§2.2.9), and updating
`docs/08-live-preview-runtime.md` / `docs/09-api-contracts.md` / `docs/10-data-model.md` to
match the shipped architecture instead of the original target design.

## 6. Active sprint

See `project/active-sprint.yaml` for the structured version. Summary: **M3.3 Manifest
Persistence** is implemented and merged to `main` (PR #23); its sprint items (SPR-3 through
SPR-6) are done. **M4 Verification Engine** kickoff planning (SPR-7), slice 1 (SPR-8), slice 2
(SPR-9), and slice 3 (bounded repair loop, SPR-10) are all done
(`feature/m4-verification-slice-3`); slice 4 (observability polish, SPR-11) is next, alongside
demonstrating the repair loop against a real provider. **M3.2 Component Adaptation** close-out
(SPR-1 `ComponentHarvester.jsx` wiring audit, SPR-2 scoring scope decision) remains open. No
sprint dates are asserted here (none found in the repo); `project/active-sprint.yaml` marks the
window as `needs-audit`.

## 7. Verification gates

Gate definitions per `docs/12-testing-quality-gates.md:60-91`, cross-checked against what this
baseline actually ran (§9):

| Gate | Definition | Current enforcement |
|---|---|---|
| Gate 1 — Plan readiness | Plan schema valid, data model defined, routes/components listed, checks listed, risks listed | **Not enforced in code.** Plan is generated but not schema-validated (§2.2.6). |
| Gate 2 — Build readiness | File paths valid, imports resolve/mocked, dependency manifest present, component manifests valid | **Partially enforced.** Files are committed via GitHub API; no import-resolution check runs first. Component manifests are now generated and schema-validated at adapt time (M3.3, `server/src/services/harvester/manifest-store.ts`), but the orchestrator's build step does not yet gate on manifest validity before committing files (no consumer of `component_manifests` in `server/src/services/orchestrator/index.ts` yet). |
| Gate 3 — Preview readiness | Preview bundle created, boots or failure shown, runtime errors captured, mock data present | **Enforced for the Railway/WebContainers surfaces** (poll-until-ready, explicit `error`/`building`/`ready` states — `server/src/routes/jobs.ts:10-28`). No "runtime console error capture" evidence found. |
| Gate 4 — Export readiness | Reviewer approved, verification summary attached, dependency diff attached, manifests attached, checksums generated | **Not implemented** (no export feature yet). |
| Repo-level CI gates (this baseline) | install / typecheck / lint / test / build, both workspaces | See §9 — lint/test/build pass; typecheck has 165 pre-existing frontend errors (not introduced by this change). |

## 8. Risks

Full register with probability/impact/mitigation in `project/risks.yaml`. Carried over from
`docs/14-milestones.md:83-90` plus new risks confirmed during this audit:

- Invalid JSON plans reach the build step because nothing validates them against
  `contracts/plan.schema.json` (confirmed gap, §2.2.6).
- ~~The QA/verification step is a no-op placeholder, so jobs can reach `review` status without
  any real lint/build/typecheck/test signal~~ **Resolved (M4 slices 1-3, 2026-07-06):** all four
  checks now run for real; a failed check gets up to 2 repair attempts (feeding the exact
  failure back to the provider); an errored check fails the job immediately (never repaired).
  Residual risk: the repair loop's *mechanics* are unit-tested, but no real LLM has actually
  fixed a real failing check in any session yet (no live provider/Postgres/GitHub token
  available) — until that's demonstrated, treat "repair fixes at least one known import/build
  error" (an M4 exit criterion) as unverified in practice, not just unimplemented.
- Documentation drift: three design docs (`08`, `09`, `10`) describe a materially different
  architecture than what's running, which will mislead new contractors/agents who read docs
  before code (confirmed gap, §2.2.1-3).
- Pre-existing TypeScript errors (165, concentrated in `src/pages/Projects.jsx` and
  `src/pages/Settings.jsx`) mean `npm run typecheck` cannot be used as a merge gate today
  without first triaging whether they're real bugs or `RefAttributes`/forwardRef typing noise.
- License/dependency-weight risk from `docs/14-milestones.md` is now partially mitigated: M3.3
  manifests record a required `license` field per adapted component (RISK-3 in
  `project/risks.yaml`, now `partially_mitigated`), though there is still no human review gate
  on that field and unmatched/custom adaptations record `license: "unknown"`.
- The manifest `score` field (M3.3) is a fixed placeholder, not a computed candidate score —
  candidate scoring (TICKET-029) is still not implemented (RISK-14).
- Branch-strategy ambiguity (`develop` vs `main`) could cause an agent to create a PR against
  a branch that doesn't exist, or to misapply the "no direct commit to main" rule.

## 9. Technical debt

- Empty/unused `provider_calls` table (§2.2.5).
- Unused `@stripe/react-stripe-js`, `@stripe/stripe-js`, `three` dependencies (§2.2.9).
- 165 pre-existing `tsc` errors on the frontend workspace, concentrated in
  `src/pages/Projects.jsx` (forwardRef components typed as taking no `children`/props — looks
  like a `React.forwardRef<Ref, Props>` generic ordering issue in a shared UI primitive) and
  `src/pages/Settings.jsx` (same pattern, plus one `?raw` Vite import with no ambient type
  declaration for `contracts/tfrs-schema-registry.md?raw`). Verified pre-existing (not touched
  by this change); root `npm run lint` is clean, so this is a `tsc`-specific gap, not an ESLint
  gap.
- No SSE `/events` endpoint despite being specified in `docs/09-api-contracts.md:70-89`; the
  frontend instead polls `job_logs`/`status` — fine for MVP, but worth an explicit ADR if it's
  the permanent direction.
- `docs/08-live-preview-runtime.md`, `docs/09-api-contracts.md`, `docs/10-data-model.md` need a
  revision pass to match the shipped job-centric architecture (§2.2.1-3), or an ADR explaining
  why the simplified model is intentional and permanent.
- Manifest `score` (M3.3) is a fixed placeholder (100/0), not a computed candidate score —
  candidate scoring (TICKET-029, RISK-14) is still not implemented.
- `component_manifests` (M3.3) has not been exercised against a live Postgres instance in this
  environment — verified via type-checking, `npm run build`, and pure-function mapping-level
  round-trip tests only (same gap `registry_components` already has, just newly documented).

## 10. Open questions

1. Is `develop` supposed to exist as a real branch (per `CLAUDE.md` / `docs/04`), or should
   those docs be updated to say `main` is the integration branch? (§2.2.8) — **strengthened
   evidence (2026-07-05), still needs a decision from Blair/repo owner**: `develop` now exists
   on the remote but has never been a PR target and is 112 files diverged from `main` with none
   of M0-M3.3's work (§2.2.8). In practice `main` is the integration branch; the open decision
   is whether to (a) update `CLAUDE.md`/`docs/04-repository-contracts.md` to say `main`, or
   (b) resync/delete the stale `develop` branch and keep the documented `develop`-first
   workflow going forward. This document and this session's PRs (#22, #23) all targeted `main`
   pending that decision — not a unilateral resolution of it.
2. ~~Is the simplified `jobs`/`plans`/`qa_runs` schema the intentional permanent data model, or is
   the full ERD in `docs/10-data-model.md` still the target for M4+?~~ **Resolved** by
   `adr/0007-manifest-persistence-data-model.md` (Status: **Accepted**): M3.3 (and, by the same
   reasoning, M4/M5) build on the existing `jobs`/`plans`/`qa_runs` schema with additive
   manifest table(s); the full ERD (`generation_requests`/`verification_runs`/
   `review_decisions`/`export_jobs`/`users`/`projects`) is deferred until after M5 pending a
   concrete M6+ requirement. Implemented: `server/src/db/migrations/005_component_manifests.sql`.
3. Should Sandpack still be built (per ADR-0002/docs/08), or should that ADR be superseded now
   that WebContainers + Railway preview are shipped and working? (§2.2.1)
4. ~~Is candidate scoring (`docs/06-component-harvester.md:49-65`, weighted 0-100 score) required
   before M3.3 manifest persistence, or can manifests ship with `score` fixed/omitted for now?~~
   **Resolved (by implementation choice, not a design authority):** M3.3 shipped with `score`
   as a fixed placeholder (100 for a registry match, 0 for unmatched/custom — see
   `server/src/services/harvester/manifest-store.ts`), not a computed signal. TICKET-029
   (candidate scoring) remains open (RISK-14) and should replace these placeholders when
   scoped.
5. Are the Stripe and `three` dependencies reserved for a near-term feature, or safe to remove?
   (§2.2.9) — `unknown`, no ADR or doc references either.
6. What is the actual sprint cadence/dates for this team? `project/active-sprint.yaml` marks
   this `needs-audit` — no sprint artifacts were found in the repo to source dates from.

## 11. Next implementation sequence

Recommended order for the next agent, most-blocking first:

1. ~~Resolve Open Question 2 (data-model target)~~ **Done** — see
   `adr/0007-manifest-persistence-data-model.md` (Accepted).
2. ~~**M3.3 Manifest Persistence**~~ **Done** — `component_manifests` table, `manifest-store.ts`
   service, `/api/adapt` wiring, tests (see the implementation update banner at the top of this
   document). Not yet run against a live Postgres in this environment.
3. **M3.2 close-out**: audit `src/pages/ComponentHarvester.jsx` against `/api/registry` +
   `/api/adapt` to confirm the UI path is real end-to-end, not just the API/unit-test layer, and
   confirm whether it should be updated to surface the new `manifest` field in adapt responses.
4. ~~**M4 kickoff (planning)**~~ **Done** — see `docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md`.
   ~~**M4 slice 1**~~ **Done** (`server/src/services/verification/`, orchestrator QA step now
   runs a real `lint` check). ~~**M4 slice 2**~~ **Done** — all four checks
   (`lint`/`build`/`typecheck`/`test`), pipeline gating, and `GET /api/jobs/:id/qa`.
   ~~**M4 slice 3**~~ **Done** — bounded repair loop (`decideRepairAction()`): a **Failed**
   outcome (not **Errored**) gets up to 2 repair attempts, feeding the exact failing output back
   into a shared BUILD/REPAIR provider-call-then-commit flow, capped by counting `qa_runs` rows
   — see the implementation update banners at the top of this document. Still outstanding: a
   manual end-to-end run against a real job in an environment with a live Postgres/GitHub
   token/Railway deploy/provider API key (§11 of the plan doc) — not possible in this session,
   carried forward from slice 1. This is the single most important thing to verify before
   treating M4 as functionally complete — the repair loop's *decision logic* is thoroughly
   tested, but whether a real LLM call actually produces a working fix is unverified.
   **Next: M4 slice 4** — observability polish (structured audit events already exist as of
   slice 3; slice 4 is about `duration_ms`/`command` columns if the API surface wants them) and
   an explicit scope decision on preview-error-triggered repair / "Should"-tier checks
   (`docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md` §10, slice 4).
5. **Candidate scoring (TICKET-029)**: replace the fixed placeholder scores in
   `server/src/services/harvester/manifest-store.ts` with the weighted 0-100 model from
   `docs/06-component-harvester.md:49-65` (RISK-14) — not blocking, but the next natural
   improvement to M3.3's output quality.
6. Everything else in §5 (roadmap) in the order listed there.

Concretely, the single highest-value next issue is **verifying M4 slices 1-3 against a real
job** (live Postgres/GitHub token/Railway/provider) — every slice so far has been verified via
unit tests with injected fakes only; nothing has confirmed the actual end-to-end behavior
(materializing a real branch, running real npm commands, a real LLM producing a real fix) works
in production. Slice 4 (observability polish) is lower-value than closing this verification gap.
