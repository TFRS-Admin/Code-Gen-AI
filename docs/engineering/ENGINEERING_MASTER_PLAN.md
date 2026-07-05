# Engineering Master Plan (EMP)

Status: **Baseline** · Owner: Blair / Code-Gen-AI engineering · Last updated: 2026-07-05

This is the canonical, evidence-based project-management document for `Code-Gen-AI`. It is
paired with the machine-readable state in `project/*.yaml`. Anything stated here as "complete"
or "in progress" is backed by a file/line citation from this repository as of the commit this
was written against (`0e8b057`, branch `claude/code-gen-ai-baseline-blzoj2`). Where the repo
does not provide direct evidence, the status is marked `unknown` or `needs-audit` rather than
assumed.

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
| Persistence | Postgres: `jobs`, `plans`, `qa_runs`, `provider_calls`, `audit_events`, `registry_components` | `server/src/db/migrations/001_initial.sql`, `004_registry_components.sql` |
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
7. **No component manifest persistence.** `contracts/component-manifest.schema.json` exists as
   a schema-only contract. `server/src/routes/adapt.ts` adapts component code and extracts TFRS
   classes but returns them directly in the response — nothing persists a manifest anywhere.
   This is exactly the scope of **M3.3**, tracked as not-started.
8. **Branching model mismatch.** `CLAUDE.md`, `docs/04-repository-contracts.md:116`, and the
   Cursor rules all say work should branch from `develop`. The remote repository has no
   `develop` branch — only `main` and short-lived `claude/*` feature branches
   (`git branch -a`, confirmed at baseline time). Either `develop` needs to be created, or the
   docs need to be updated to say `main`. Flagged as an open question below, not resolved by
   this baseline.
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
| M3.3 — Manifest Persistence | **Next (not started)** | `contracts/component-manifest.schema.json` exists; no table, service, or route produces or stores a manifest. |
| M4 — Verification / Repair Loop | **Planned (not started)** | `qa_runs` table exists but is never written to; the orchestrator's QA step is a hard-coded placeholder (§2.2.4). No repair-from-failure code path exists. |
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
- **EPIC-6 Component Harvester** (M3) — in progress; see M3.1/M3.2/M3.3 above.
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
2. **M3.3 Manifest Persistence** — design and land `component_sources`/`harvested_components`
   (or an equivalent minimal table), a manifest-generation step that satisfies
   `contracts/component-manifest.schema.json`, and wire it into the `/api/adapt` response path.
3. **M4 Verification / Repair Loop** — replace the QA placeholder with real
   lint/build/typecheck/test execution against the sandboxed checkout, persist results to
   `qa_runs`, and add a repair pass that feeds failures back to the provider
   (`docs/08-live-preview-runtime.md:134-142` describes the intended loop).
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

See `project/active-sprint.yaml` for the structured version. Summary: the active sprint closes
out **M3.2 Component Adaptation** and starts **M3.3 Manifest Persistence** — the two milestones
the task brief identified as "in progress" and "next." No sprint dates are asserted here (none
found in the repo); `project/active-sprint.yaml` marks the window as `needs-audit`.

## 7. Verification gates

Gate definitions per `docs/12-testing-quality-gates.md:60-91`, cross-checked against what this
baseline actually ran (§9):

| Gate | Definition | Current enforcement |
|---|---|---|
| Gate 1 — Plan readiness | Plan schema valid, data model defined, routes/components listed, checks listed, risks listed | **Not enforced in code.** Plan is generated but not schema-validated (§2.2.6). |
| Gate 2 — Build readiness | File paths valid, imports resolve/mocked, dependency manifest present, component manifests valid | **Partially enforced.** Files are committed via GitHub API; no import-resolution or manifest check runs first. |
| Gate 3 — Preview readiness | Preview bundle created, boots or failure shown, runtime errors captured, mock data present | **Enforced for the Railway/WebContainers surfaces** (poll-until-ready, explicit `error`/`building`/`ready` states — `server/src/routes/jobs.ts:10-28`). No "runtime console error capture" evidence found. |
| Gate 4 — Export readiness | Reviewer approved, verification summary attached, dependency diff attached, manifests attached, checksums generated | **Not implemented** (no export feature yet). |
| Repo-level CI gates (this baseline) | install / typecheck / lint / test / build, both workspaces | See §9 — lint/test/build pass; typecheck has 165 pre-existing frontend errors (not introduced by this change). |

## 8. Risks

Full register with probability/impact/mitigation in `project/risks.yaml`. Carried over from
`docs/14-milestones.md:83-90` plus new risks confirmed during this audit:

- Invalid JSON plans reach the build step because nothing validates them against
  `contracts/plan.schema.json` (confirmed gap, §2.2.6).
- The QA/verification step is a no-op placeholder, so jobs can reach `review` status without
  any real lint/build/typecheck/test signal (confirmed gap, §2.2.4).
- Documentation drift: three design docs (`08`, `09`, `10`) describe a materially different
  architecture than what's running, which will mislead new contractors/agents who read docs
  before code (confirmed gap, §2.2.1-3).
- Pre-existing TypeScript errors (165, concentrated in `src/pages/Projects.jsx` and
  `src/pages/Settings.jsx`) mean `npm run typecheck` cannot be used as a merge gate today
  without first triaging whether they're real bugs or `RefAttributes`/forwardRef typing noise.
- License/dependency-weight risk from `docs/14-milestones.md` remains open because there is no
  manifest persistence yet to record it against (M3.3 dependency).
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

## 10. Open questions

1. Is `develop` supposed to exist as a real branch (per `CLAUDE.md` / `docs/04`), or should
   those docs be updated to say `main` is the integration branch? (§2.2.8) — **needs a decision
   from Blair/repo owner**, not resolved by this baseline.
2. Is the simplified `jobs`/`plans`/`qa_runs` schema the intentional permanent data model, or is
   the full ERD in `docs/10-data-model.md` still the target for M4+? This determines whether
   M3.3/M4/M5 build on `jobs`/`plans` or introduce the originally-specified
   `generation_requests`/`verification_runs`/`review_decisions`/`export_jobs` tables.
3. Should Sandpack still be built (per ADR-0002/docs/08), or should that ADR be superseded now
   that WebContainers + Railway preview are shipped and working? (§2.2.1)
4. Is candidate scoring (`docs/06-component-harvester.md:49-65`, weighted 0-100 score) required
   before M3.3 manifest persistence, or can manifests ship with `score` fixed/omitted for now?
5. Are the Stripe and `three` dependencies reserved for a near-term feature, or safe to remove?
   (§2.2.9) — `unknown`, no ADR or doc references either.
6. What is the actual sprint cadence/dates for this team? `project/active-sprint.yaml` marks
   this `needs-audit` — no sprint artifacts were found in the repo to source dates from.

## 11. Next implementation sequence

Recommended order for the next agent, most-blocking first:

1. **Resolve Open Question 2** (data-model target) — this gates how M3.3 is built and avoids
   throwaway schema work.
2. **M3.2 close-out**: audit `src/pages/ComponentHarvester.jsx` against `/api/registry` +
   `/api/adapt` to confirm the UI path is real end-to-end, not just the API/unit-test layer.
3. **M3.3 Manifest Persistence**: add the manifest table(s) decided in step 1, a service that
   populates `contracts/component-manifest.schema.json`-shaped records from the
   `/api/adapt` flow, and tests mirroring the existing `adapt.test.ts`/`registry.test.ts`
   patterns.
4. **M4 kickoff**: replace the QA placeholder (`server/src/services/orchestrator/index.ts:357-367`)
   with real `lint`/`build`/`typecheck`/`test` execution against the sandboxed checkout,
   persisted to `qa_runs`.
5. Everything else in §5 (roadmap) in the order listed there.

Concretely, the single highest-value next issue is **#3 (M3.3 Manifest Persistence)** once
Open Question 2 is answered — it's explicitly called out as "next" in the assumed milestone
state, has a schema contract already waiting (`contracts/component-manifest.schema.json`), and
unblocks the M3 exit criteria in `docs/14-milestones.md:43-48` ("manifests validate").
