# ADR-0007-Manifest Persistence Data Model

## Status

Proposed

## Context

M3.3 (Harvester — Manifest Persistence) is the next milestone (`project/milestones.yaml:116-134`,
`docs/engineering/ENGINEERING_MASTER_PLAN.md:116-120`). `contracts/component-manifest.schema.json`
exists and defines the manifest shape, but nothing in the codebase generates or stores a manifest
today: `server/src/routes/adapt.ts` calls `adaptComponentCode`/`extractTFRSClasses`
(`server/src/services/harvester/tfrs-adapter.ts`) and returns `{ adaptedCode, tfrsClasses,
componentMetadata }` directly in the HTTP response — no manifest object is built, and no table
exists to persist one (`grep -r manifest server/src/db` returns nothing).

This ADR resolves Open Question 2 from the Engineering Master Plan
(`docs/engineering/ENGINEERING_MASTER_PLAN.md:236-239`, tracked as `phase-data-model-decision`
in `project/roadmap.yaml:21-31` and `SPR-3` in `project/active-sprint.yaml:34-38`): should M3.3
build on the existing lean schema, or migrate toward the fuller ERD in `docs/10-data-model.md`?

### Current implementation evidence

- The running schema (`server/src/db/migrations/001_initial.sql`,
  `004_registry_components.sql`) is `jobs`, `plans`, `qa_runs`, `provider_calls`,
  `audit_events`, `registry_components`. There is no `users`, `projects`,
  `generation_requests`, `component_sources`, `harvested_components`, `generated_artifacts`,
  `preview_sessions`, `verification_runs`, `review_decisions`, or `export_jobs` table anywhere
  in the migrations directory.
- `jobs.id` and `plans.id` are raw Postgres UUIDs (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
  `001_initial.sql:12,33`). No application code mints prefixed IDs (`grep` for
  `gen_random_uuid|randomUUID|uuid()` in `server/src/services/orchestrator/index.ts` returns
  nothing beyond the DB default).
- `contracts/component-manifest.schema.json:24-31` requires `manifestId` to match
  `^hc_[A-Za-z0-9_-]+$` and `generationPlanId` to match `^plan_[A-Za-z0-9_-]+$`. Neither the lean
  schema's raw UUIDs nor the full ERD's raw UUIDs (`docs/10-data-model.md:42-49`,
  `generation_plans.id : uuid`) satisfy these patterns as-is — **this is an ID-format gap that
  exists independent of which data model is chosen**, and must be closed either way by minting a
  synthetic prefixed manifest ID at write time and/or relaxing the schema's `pattern` constraints.
- The one existing "durable catalog" precedent, `registry_components`
  (`server/src/services/harvester/store.ts`), is a flat table with plain columns
  (`dependencies`/`tfrs_classes` as `JSONB`, not a normalized join to a separate sources table)
  keyed by `UNIQUE(source, name)`, upserted directly — it does not reference `jobs` or `plans` at
  all. It is the closest working analog for how M3.3 persistence has been built so far in this
  codebase.
- There is no `users` or `projects` table and no auth/session code anywhere in `server/src`
  (confirmed at M6 in `project/milestones.yaml:179-188`: "No auth, role checks, or rate limiting
  found in `server/src` at baseline time"). The full ERD's `generation_requests`,
  `harvested_components`, `preview_sessions`, `verification_runs`, `review_decisions`, and
  `export_jobs` all key off `generation_requests.user_id`/`project_id`
  (`docs/10-data-model.md:31-40,173-183`), which have no implementation to attach to.
- `docs/14-milestones.md:41-48` (M3 exit criteria) requires only "Manifests validate" — it does
  not require a normalized `component_sources`/`harvested_components` split, nor a
  `generation_requests` parent table.

### Migration risk if the full ERD is adopted now

Adopting `docs/10-data-model.md` for M3.3 would require, at minimum:

1. Introducing `users` and `projects` tables and threading `owner_user_id`/`project_id` through
   every write path, with no current auth system to source real user IDs from (M6 is
   "Planned (not started)", `project/milestones.yaml:179-188`).
2. Replacing or dual-writing `jobs` as `generation_requests` — every route
   (`server/src/routes/jobs.ts`, `generations.ts`, `github.ts`), the orchestrator state machine
   (`server/src/services/orchestrator/index.ts:242,265,358,370,393`), and the `plans`/`qa_runs`/
   `provider_calls`/`audit_events` foreign keys that currently point at `jobs(id)` would all need
   to change in the same migration, well outside M3.3's scope.
3. Re-keying `registry_components` (or introducing a parallel `component_sources` table) to fit
   the `component_sources` → `harvested_components` join, duplicating the registry work already
   shipped and tested in M3.1 (`registry.test.ts`, `registry.ts`).

None of this is required by the M3.3 exit criteria, M4's `qa_runs`-based verification, or M5's
export/PR workflow (see Evaluation below); it would be schema and plumbing work justified only by
the original target design, not by anything M3.3 through M5 actually need. This conflicts with
`CLAUDE.md`'s "Implement incrementally" and "Establish data structures before UI" project rules —
the full ERD is a good long-term target, but it is not the next incremental step from the schema
that is actually running.

## Evaluation

| Criterion | Lean model + minimal manifest table(s) | Full ERD migration |
|---|---|---|
| Current implementation evidence | Matches the shipped pattern (`jobs`/`plans`/`qa_runs`/`registry_components`); `registry_components` is a direct precedent for a flat, job/plan-keyed harvester table. | No table in the full ERD has been implemented yet; would be greenfield, not incremental. |
| Migration risk | Additive: one or two new tables, FK to existing `plans`/`jobs`. No existing table renamed or re-keyed. | High: renames/replaces `jobs`, requires `users`/`projects` with no auth system to populate them, touches every route and the orchestrator state machine. |
| Compatibility with M3.3 | Exit criteria (`docs/14-milestones.md:43-48`, `project/milestones.yaml:120-134`) only require a manifest table and validating manifests — satisfied directly. | Satisfies the same criteria but only after the unrelated `users`/`projects`/`generation_requests` work lands first. |
| Impact on M4 (verification) | `qa_runs` already keys off `job_id` today; a manifest table keyed the same way (`job_id`/`plan_id`) keeps M4's repair loop working against the same lean keys without changes. | M4 would need to be re-planned against `generation_requests`/`verification_runs` instead of `jobs`/`qa_runs`, a second unscoped migration. |
| Impact on M5 (export/PR) | Export packaging (`docs/12-testing-quality-gates.md:84-91`, Gate 4) needs to attach manifests to a job/plan at export time — a simple join on `job_id`/`plan_id` is suffficient. | Export would need to join through `generation_requests`/`export_jobs`, neither of which exist; adds the same unscoped migration risk to M5. |
| Simplest path to durable manifests | One additive migration, one service module, one route change (`/api/adapt` response), following the `registry_components`/`store.ts` pattern already in the codebase. | Requires the ERD migration above before any manifest can be written at all. |

## Decision

Use the existing lean data model (`jobs` / `plans` / `qa_runs` / `registry_components`) for M3.3.
Add the minimal manifest persistence table(s) needed to satisfy
`contracts/component-manifest.schema.json` and the M3 exit criteria, keyed off the existing
`jobs`/`plans` UUIDs (not `users`/`projects`/`generation_requests`). Defer the full ERD in
`docs/10-data-model.md` until after M5, and revisit it only if a concrete M6+ requirement (e.g.
multi-tenant auth, per-project scoping) demands it.

Concretely, this means:

- A new table (working name: `component_manifests`) with columns mirroring
  `contracts/component-manifest.schema.json`'s required fields (`manifest_id`,
  `generation_plan_id`/`job_id`, `requirement_id`, `component_name`, `source_type`, `source_name`,
  `source_url`, `license`, `score`, `original_files`, `adapted_files`, `dependencies_added`,
  `dependencies_removed`, `tfrs_adaptations`, `risk_notes`, `custom_build_exception`), FK'd to
  `plans(id)` and/or `jobs(id)`, following the `registry_components` precedent (flat columns,
  `JSONB` for array fields, not a normalized `component_sources` join).
- A synthetic, prefixed manifest ID (`hc_<uuid>` or similar) minted at insert time to satisfy the
  schema's `manifestId` pattern, and a similarly prefixed representation of `generationPlanId`
  (e.g. `plan_<plans.id>`) — resolving the ID-format gap identified above without changing how
  `jobs`/`plans` primary keys work internally.
- No new `users`, `projects`, `generation_requests`, `component_sources`, `harvested_components`,
  `preview_sessions`, `verification_runs`, `review_decisions`, or `export_jobs` tables as part of
  this work.

## Consequences

Positive:

- M3.3 can proceed immediately as an additive migration with no risk to the already-shipped
  `jobs`/`plans`/`qa_runs`/`registry_components` code paths (M1, M2, M3.1, M3.2).
- M4 and M5 continue to build on the same lean keys (`job_id`/`plan_id`) they already use via
  `qa_runs`, so no re-planning is needed there either.
- Matches the existing `registry_components`/`store.ts` implementation pattern, so the next agent
  has a working template to copy rather than inventing a new persistence style.

Negative:

- `docs/10-data-model.md` remains aspirational and increasingly diverges from the shipped schema
  (already flagged as `RISK-9` in `project/risks.yaml`); this ADR adds one more table to that gap
  until a future revision pass or a superseding ADR addresses it.
- If multi-tenant/auth requirements (M6) later force `users`/`projects` into the schema, the
  manifest table's `job_id`/`plan_id` keys will need a follow-up migration to also reach a
  project/user scope — deferred risk, not eliminated.
- The manifest schema's `hc_`/`plan_` ID pattern requires a small ID-mapping shim
  (synthetic prefixed ID ↔ internal UUID) that a full ERD adoption would still also need, since
  the full ERD's IDs are `uuid` too (`docs/10-data-model.md:42`) — this negative applies to both
  paths equally and is not a point against the lean model specifically.

## Alternatives considered

- **Migrate to the full ERD now** (`docs/10-data-model.md`): rejected for M3.3 — introduces
  `users`/`projects`/`generation_requests` with no auth system to populate them, requires
  renaming/re-keying `jobs` and every table that references it, and is not required by any M3.3
  through M5 exit criterion. Revisit post-M5 if a concrete M6 requirement demands it.
- **Store the manifest as a JSONB blob on `plans` or `qa_runs` instead of a new table**: rejected
  — a job/plan can harvest multiple components per generation (one manifest per
  `requirementId`), so a single JSONB column on a 1-row-per-job/plan table cannot represent a
  1-to-many relationship without becoming a JSONB array anyway, which is harder to query/validate
  per-manifest than a dedicated table with one row per manifest (consistent with how
  `qa_runs`/`registry_components` are each already their own table rather than columns bolted
  onto `jobs`).
- **Relax `contracts/component-manifest.schema.json`'s ID patterns to accept raw UUIDs instead of
  minting prefixed synthetic IDs**: viable alternative, not chosen here because the schema is an
  existing accepted contract (M0) and changing it is a separate, smaller decision than the data
  model question this ADR resolves; noted as an open implementation detail for the M3.3 build
  prompt rather than decided by this ADR.
