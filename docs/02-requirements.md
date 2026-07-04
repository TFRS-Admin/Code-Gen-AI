# Requirements

## Product requirements

### Must have

| ID | Requirement | Acceptance criteria |
|---|---|---|
| PR-M1 | User can describe an app/page/feature to Blair | Form/chat captures goal, audience, pages, data, design constraints, and integrations |
| PR-M2 | Blair produces a plan before code | Every generation has a valid persisted plan |
| PR-M3 | User can preview generated React app | Preview boots generated file map and reports errors |
| PR-M4 | User can inspect generated files | File tree and source viewer available before export |
| PR-M5 | User can export generated code | ZIP in MVP, Git patch/branch later |
| PR-M6 | User can choose repository context | Supports `Code-Gen-AI`, `TFRSupply-frontend`, and `tfrsupply-storefront` profiles |
| PR-M7 | Generated UI follows TFRS | Uses approved tokens, typography, layout, and interactions |
| PR-M8 | Platform records provenance | Plans, sources, artifacts, verification, and review decisions are traceable |

### Should have

| ID | Requirement | Acceptance criteria |
|---|---|---|
| PR-S1 | Component source recommendations | Blair explains internal/Shadcn/GitHub/custom choice |
| PR-S2 | Repair loop | Build/runtime errors feed back into targeted repair |
| PR-S3 | Multi-provider gateway | OpenAI, Anthropic, mock provider share one interface |
| PR-S4 | Review gates | Reviewer can approve, request changes, or reject |
| PR-S5 | Export manifest | Export includes plan ID, component manifests, dependency changes, and verification summary |

### Could have

| ID | Requirement |
|---|---|
| PR-C1 | Visual regression comparison |
| PR-C2 | Component marketplace |
| PR-C3 | Internal retrieval index |
| PR-C4 | Cost dashboard |
| PR-C5 | Team roles |

### Won't have in MVP

| ID | Requirement | Reason |
|---|---|---|
| PR-W1 | Full production deployment | MVP focuses on generation, preview, review |
| PR-W2 | Unrestricted dependency installation | Supply-chain and bundle-size risk |
| PR-W3 | Direct browser provider API calls | Key exposure risk |
| PR-W4 | Automatic merge to `main` | Governance boundary |

## Technical requirements

### Must have

| ID | Requirement | Acceptance criteria |
|---|---|---|
| TR-M1 | React/Vite frontend | Existing generator remains React/Vite-based |
| TR-M2 | Server-side LLM gateway | Provider keys stay server-only |
| TR-M3 | Zod validation | Requests, plans, manifests are validated |
| TR-M4 | Persistent audit trail | Lifecycle actions write audit events |
| TR-M5 | Sandboxed preview | Generated code runs in isolated browser preview |
| TR-M6 | Component manifest | Every harvested/adapted component records source, license, dependencies, modifications |
| TR-M7 | Testable output | Generated files can be linted, type checked, and previewed |
| TR-M8 | Environment config | Secrets loaded from environment/secret store |

### Should have

| ID | Requirement |
|---|---|
| TR-S1 | Provider abstraction |
| TR-S2 | Streaming generation state |
| TR-S3 | Postgres-compatible persistence |
| TR-S4 | Git export integration |
| TR-S5 | Preview console capture |

## Constraints

- Use `develop` as source branch.
- Work in `feature/*`.
- Prefer Radix/Shadcn copied components over heavy UI libraries.
- Establish data structures before UI.
- Keep generated UI previewable without backend deployment.
- Preserve TFRS Tactical Command Deck aesthetic.

## Assumptions

- MVP can start as one app with `server/` plus React client.
- Postgres-compatible persistence is the production target.
- Sandpack is sufficient for first live React preview.
- WebContainers is phase 2 for full Node runtime.
- Human approval is required before production target repository changes.
