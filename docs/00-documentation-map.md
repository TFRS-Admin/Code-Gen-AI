# Documentation Map

## Project management (canonical)

For current status, roadmap, active sprint, risks, and backlog, `docs/engineering/ENGINEERING_MASTER_PLAN.md`
and the machine-readable files under `project/` (`roadmap.yaml`, `milestones.yaml`,
`active-sprint.yaml`, `risks.yaml`, `backlog.yaml`) are the **canonical, evidence-based**
sources — not the aspirational milestone/backlog docs below. `docs/14-milestones.md` and
`backlog/mvp-epics.md` remain the original target definitions; the EMP and `project/*.yaml`
track actual status against them and record where shipped code has diverged. Any agent picking
up work on this repo should read the EMP before making status claims or picking a next task.

## Purpose

This suite lets contractors and AI coding assistants understand, modify, and extend **Code-Gen-AI**, a modular AI coding platform that favors **component stitching** over from-scratch one-shot generation.

The platform flow is:

1. Capture user intent through Blair.
2. Produce a structured plan before code.
3. Select a Base44-style starter/template where useful.
4. Harvest proven React/Tailwind/Radix components.
5. Adapt components to the TFRS Tactical Command Deck design system.
6. Preview generated React code live in the browser.
7. Export approved files through governed Git workflows.

## Audience

| Audience | Primary docs |
|---|---|
| Any agent starting a work session | `docs/engineering/ENGINEERING_MASTER_PLAN.md`, `project/*.yaml` |
| Product owner | `01-main-spec.md`, `02-requirements.md`, `14-milestones.md` |
| Architect | `03-system-architecture.md`, `08-live-preview-runtime.md`, `10-data-model.md` |
| Frontend contractor | `06-component-harvester.md`, `07-design-system.md`, `13-implementation-plan.md` |
| Backend contractor | `09-api-contracts.md`, `10-data-model.md`, `11-security-threat-model.md` |
| AI coding assistant | `CLAUDE.md`, `.cursor/rules/blair-agent-lifecycle.mdc`, `prompts/blair-system-prompt.md` |
| QA/release lead | `12-testing-quality-gates.md`, `15-gathering-results.md` |

## Documentation principles

- **Plan first:** no generated code without a persisted plan.
- **Data first:** schemas/entities before UI.
- **Harvest first:** source proven components before custom UI generation.
- **Preview first:** validate generated UI in browser before export.
- **TFRS always:** deep navy/carbon, steel surfaces, signal red/gold accents, tactical typography.
