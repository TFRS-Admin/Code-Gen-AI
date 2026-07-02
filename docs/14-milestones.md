# Milestones

| Milestone | Owner | Outcome |
|---|---|---|
| M0 Documentation Baseline | Architect | Shared spec, rules, schemas, ADRs |
| M1 Plan-First API | Backend | Requests and plans persist |
| M2 Live Preview | Frontend | React previews run in browser |
| M3 Harvester MVP | Full-stack | Components sourced, scored, adapted |
| M4 Verification Loop | Full-stack/QA | Errors captured and repairable |
| M5 Export Workflow | Backend/DevOps | ZIP/Git patch export with approvals |
| M6 Pilot | Product/QA | 3 screens generated and reviewed |

## M0 — Documentation Baseline

Exit criteria:

- Docs committed.
- AI rules committed.
- Schemas committed.
- ADRs committed.
- Backlog created.

## M1 — Plan-First API

Exit criteria:

- Prompt creates persisted request.
- Provider/mock returns valid JSON plan.
- Invalid plan rejected.
- Audit events created.

## M2 — Live Preview

Exit criteria:

- Generated React page renders.
- Build/runtime errors visible.
- Preview status persists.
- No secrets in preview bundle.

## M3 — Harvester MVP

Exit criteria:

- Three component categories harvested.
- Manifests validate.
- Heavy/disallowed packages rejected.
- TFRS classes applied.

## M4 — Verification Loop

Exit criteria:

- Verification failures produce repair context.
- Repair fixes at least one known import/build error.
- Reviewer can approve/request changes.

## M5 — Export Workflow

Exit criteria:

- Approved generation exports successfully.
- Unapproved generation blocked.
- Export includes plan, files, manifests, verification, and review.

## M6 — Pilot

Pilot scenarios:

1. Tactical landing page.
2. Dashboard screen with metrics and table.
3. Quote request flow for storefront.

Exit criteria:

- All scenarios preview.
- At least two use harvested/internal components.
- Reviewer can trace provenance.
- Production hardening backlog created.

## Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Invalid JSON plans | Medium | High | Structured outputs, retries, schema repair |
| Preview dependency mismatch | Medium | Medium | Dependency allowlist, WebContainers phase 2 |
| License ambiguity | Medium | High | Manifest license field, review |
| TFRS drift | High | Medium | Design adapter and checklist |
| Lifecycle bypass | Medium | High | AI rules and CI checks |
| Scope creep into deployment | Medium | High | Keep deployment out of MVP |
