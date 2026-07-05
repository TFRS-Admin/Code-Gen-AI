# Claude / Claude Code Instructions for Code-Gen-AI

## Project status (canonical)

Before starting work, read `docs/engineering/ENGINEERING_MASTER_PLAN.md` and the
machine-readable state in `project/` (`roadmap.yaml`, `milestones.yaml`, `active-sprint.yaml`,
`risks.yaml`, `backlog.yaml`). These are the canonical, evidence-based source for current
status, the active sprint, and the next recommended task — not `docs/14-milestones.md` or
`backlog/mvp-epics.md` alone, which describe the original target and may be ahead of or behind
what is actually implemented.

## Lifecycle

Before writing or changing code:

1. Define the request.
2. Produce or reference a valid plan.
3. Confirm data model/schema.
4. Identify component sourcing strategy.
5. Implement incrementally.
6. Verify with tests/checks.
7. Prepare review notes.
8. Ship only through approved branch/PR workflow.

## Project rules

- No one-shot prompts.
- No direct commits to `main`.
- Start from `develop`; create `feature/*`.
- Prefer local Radix/Shadcn-style components.
- Use TFRS Tactical Command Deck design.
- Establish data structures before UI.
- Preview must run without production backend.
- Provider APIs are server-side only.
- Use Zod for validation.
- Keep generated files traceable to plan IDs.

## Component sourcing order

1. Internal TFRSupply component.
2. Approved Base44-style component/template.
3. Shadcn/Radix-style component.
4. Allowlisted GitHub component.
5. Custom component with exception record.

## Disallowed by default

- MUI.
- Bootstrap.
- Ant Design.
- Chakra UI.
- Browser-side provider API calls.
- Production API calls from preview code.
- Unreviewed package additions.
