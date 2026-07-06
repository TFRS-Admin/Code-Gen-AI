# ADR-0008-M4 Verification Engine Scope Boundaries

## Status

Accepted

## Context

M4 slices 1-3 (`docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md`) shipped real
lint/build/typecheck/test verification, pipeline gating, and a bounded repair loop
(`server/src/services/orchestrator/index.ts`, `server/src/services/verification/`). Slice 4 was
originally scoped as "observability polish + remaining Verify-phase checks," but left several
items as open questions rather than decisions: is preview-error-triggered repair in scope? Are
accessibility smoke checks in scope? Are license checks in scope? Is structured timing required
now? This ADR makes each of those four decisions explicit, evidence-backed, and final for M4 —
matching the same discipline `adr/0007-manifest-persistence-data-model.md` applied to the
data-model question (decide once, record why, avoid re-litigating mid-slice).

`docs/14-milestones.md`'s M4 exit criteria are: "Verification failures produce repair context,"
"Repair fixes at least one known import/build error," "Reviewer can approve/request changes."
None of the four items below are required to satisfy these criteria.

## Decision

### 1. Preview-error-triggered repair: **deferred**, not in M4

`docs/08-live-preview-runtime.md`'s "Error repair loop" (preview emits error → persist → create
verification failure → feed plan/files/error log back to Blair) is a different signal source
than M4's build-time checks: it's about a *runtime* error the browser throws when a preview
renders, not a lint/build/typecheck/test failure. Two concrete gaps block treating it as an M4
extension rather than deferring it:

- **No capture mechanism exists yet.** `project/milestones.yaml` M2's "No secrets in preview
  bundle" criterion is `met: unknown`, and no code in `server/src` persists a runtime/console
  error log from either preview surface (WebContainers or Railway). There is nothing for a
  preview-repair loop to consume.
- **It fires from a different pipeline stage.** M4's repair loop (slice 3) triggers from the QA
  step, before PREVIEW ever runs. A preview-error repair loop would need to trigger *after*
  PREVIEW, with a different context shape (browser stack trace, not check stdout/stderr) — not a
  natural extension of `decideRepairAction()`/`generateAndCommitFiles()`, but a second, distinct
  mechanism.

Revisit once preview error capture exists as its own tracked gap (already flagged as a technical
debt item in `docs/engineering/ENGINEERING_MASTER_PLAN.md` §9); building the repair trigger for a
signal that doesn't exist yet would be speculative.

### 2. Accessibility smoke checks: **deferred**, not in M4

`docs/05-agent-lifecycle.md` lists accessibility smoke as a "Should"-tier check, not "Required."
`project/risks.yaml` RISK-4 already tracks this gap ("No automated design checklist /
accessibility smoke test found"). Structurally, it doesn't fit the current verification engine's
model: `server/src/services/verification/checks.ts`'s `runCommand`/`detectAvailableChecks` model
assumes "run a `package.json` script, classify the exit code" — an accessibility smoke check
(e.g. axe-core against a rendered page) needs a *running instance* to test against (the live
preview), not a static `npm run <script>` invocation in a materialized-but-not-served checkout.
Adding it would mean building browser-automation-against-a-live-preview infrastructure, a
materially larger scope than extending the existing four checks. Revisit alongside preview
infrastructure work, not as an M4 slice.

### 3. License checks: **deferred**, out of M4's verification-engine scope entirely

License concerns in this codebase are already tracked as an M3 (harvester) issue, not an M4
(verification) one: `contracts/component-manifest.schema.json`'s required `license` field and
`project/risks.yaml` RISK-3 (license ambiguity, `partially_mitigated` by M3.3) and RISK-8 (no
dependency allowlist enforcement at build time) already own this concern for *harvested
components*. There's no equivalent "does this generated repo have a license problem" check
expressible as a `package.json` script the way lint/build/typecheck/test are (no
`scripts.license` convention exists; a real implementation would need a new tool like
`license-checker`, a new dependency decision, and a new output format — none of that is
implied by M4's exit criteria). Keeping license checks with the harvester/manifest work (M3.3,
RISK-8) rather than duplicating a second license-checking mechanism inside the verification
engine avoids two divergent implementations of the same concern.

### 4. Structured timing fields: **added now, in-memory only** — no migration

Timing (how long did install/lint/build/typecheck/test take) is useful for future observability
work and cheap to add, so it ships in this slice — but only as an in-memory `durationMs` field on
`CheckResult` (`server/src/services/verification/checks.ts`), returned in the verification result
object. It is **not** persisted to `qa_runs` in this change: no consumer of a `duration_ms` column
exists yet (`GET /api/jobs/:id/qa` doesn't surface it, no frontend displays it), and
`docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md` §3 already flagged `duration_ms`/`command`
columns as "candidate for slice 4 if the API surface work wants to display them" — the API
surface doesn't want them yet, so per this project's lean-model precedent
(`adr/0007-manifest-persistence-data-model.md`: don't add a column speculatively), no migration is
added. If a real consumer emerges, adding a nullable `*_duration_ms` column set alongside the
existing `*_passed`/`*_output` pairs is a small, additive, non-breaking follow-up.

## Consequences

Positive:

- M4 slice 4 is now fully scoped, not open-ended — no more "evaluate whether X is in scope"
  hanging over the milestone.
- Each deferral is grounded in a concrete structural reason (missing signal source, missing
  infrastructure, wrong owning subsystem), not just "not enough time."
- Timing data ships without schema risk — it's available in-process immediately, and the
  migration decision is deferred until there's real evidence it's needed, consistent with how
  this project has handled every other schema question so far.

Negative:

- Accessibility and preview-error-repair gaps remain open (RISK-4 and the preview-capture debt
  item) and are not getting closer to resolution as a side effect of M4 — they'll need their own
  scoped work later.
- `durationMs` is invisible outside a single verification run's return value until something
  persists or surfaces it — if a consumer need emerges before a migration lands, it'll need to be
  re-computed rather than queried historically.

## Alternatives considered

- **Bundle preview-error repair into M4 slice 4 anyway**: rejected — there is no error-capture
  signal to consume yet; building the repair trigger first would be building on a foundation that
  doesn't exist, the inverse of this project's "verify the foundation before building on it"
  approach used for M4 slice 1 (workspace materialization) itself.
- **Implement accessibility smoke via a lightweight heuristic (e.g., static JSX attribute
  scanning) instead of full axe-core**: considered, but this would produce a check meaningfully
  weaker than what `docs/05-agent-lifecycle.md`/`docs/15-gathering-results.md` actually specify
  (a real accessibility smoke pass rate), risking a false sense of coverage. Better to defer than
  ship a check that doesn't do what its name implies.
- **Persist `duration_ms` columns now, speculatively**: rejected for the same reason ADR-0007
  rejected speculative schema — no proven consumer, and easy to add later without breaking
  anything already built on the current shape.
