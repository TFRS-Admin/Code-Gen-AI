# System Architecture

## System context

```plantuml
@startuml
title System Context

actor "Builder / Product Owner" as User
rectangle "Code-Gen-AI Platform" {
  component "Blair UI" as Blair
  component "Generation API" as API
  component "Preview Runtime" as Preview
  component "Component Harvester" as Harvester
}
cloud "LLM Providers\nOpenAI / Anthropic" as Providers
database "Persistence" as DB
folder "TFRSupply-frontend" as DS
folder "tfrsupply-storefront" as Storefront
cloud "Approved External Registries" as Registries

User --> Blair
Blair --> API
API --> Providers
API --> DB
API --> Harvester
Harvester --> DS
Harvester --> Registries
API --> Preview
API --> Storefront
@enduml
```

## Container view

```plantuml
@startuml
title Code-Gen-AI Containers

actor User

node "Browser" {
  component "React/Vite App" as WebApp
  component "GeneratorForm.jsx" as Form
  component "PreviewPanel.jsx" as PreviewPanel
  component "Sandpack Preview" as Sandpack
}

node "Server" {
  component "Express API" as Express
  component "Provider Gateway" as Gateway
  component "Orchestrator" as Orchestrator
  component "Harvester Service" as Harvester
  component "Export Service" as Export
}

database "Postgres-compatible DB" as DB
folder "Object/File Storage\noptional" as Files

User --> WebApp
WebApp --> Form
WebApp --> PreviewPanel
PreviewPanel --> Sandpack
Form --> Express
PreviewPanel --> Express
Express --> Orchestrator
Orchestrator --> Gateway
Orchestrator --> Harvester
Orchestrator --> Export
Express --> DB
Express --> Files
@enduml
```

## Frontend modules

| Module | Responsibility |
|---|---|
| `GeneratorForm.jsx` | Capture user intent and start generation |
| `PreviewPanel.jsx` | Render live preview and verification status |
| `FileTree.tsx` | Inspect generated files |
| `ReviewDrawer.tsx` | Approve/request changes/reject output |
| `GenerationTimeline.tsx` | Display lifecycle progress |
| `useGeneration.ts` | API calls and streaming state |
| `TfrsThemeProvider.tsx` | Theme tokens and shared classes |

## Backend modules

| Module | Responsibility |
|---|---|
| `routes/generations.ts` | Generation endpoints |
| `services/orchestrator/` | Lifecycle state machine |
| `services/providers/` | OpenAI/Anthropic/mock adapters |
| `services/harvester/` | Source search, scoring, extraction, adaptation |
| `services/preview/` | Preview bundle/file map creation |
| `services/export/` | ZIP, patch, branch bundle |
| `services/audit/` | Append-only audit trail |
| `db/` | Migrations and queries |

## Request lifecycle

```plantuml
@startuml
title Generation Request Sequence

actor User
participant "Generator UI" as UI
participant "Generation API" as API
participant "Orchestrator" as Orch
participant "Provider Gateway" as LLM
participant "Harvester" as Harv
database "DB" as DB
participant "Preview Runtime" as Preview

User -> UI: Submit intent
UI -> API: POST /api/generations
API -> DB: Insert generation_request
API -> Orch: start(request_id)
Orch -> LLM: create structured plan
LLM --> Orch: JSON plan
Orch -> DB: Persist generation_plan
Orch -> Harv: resolve component needs
Harv --> Orch: component manifests
Orch -> LLM: generate/adapt files
LLM --> Orch: file map
Orch -> DB: Persist artifacts
UI -> API: GET generated files
API --> UI: file map
UI -> Preview: mount file map
Preview --> UI: build/runtime status
UI -> API: report preview result
@enduml
```

## Trust boundaries

| Boundary | Trust level |
|---|---|
| Server API, provider gateway, database, audit log | Trusted |
| Generated files before review, preview logs, user prompt content | Semi-trusted |
| External component sources and raw model output | Untrusted |

## ADRs

- ADR-0001: Plan-first generation.
- ADR-0002: Sandpack MVP preview, WebContainers phase 2.
- ADR-0003: Radix/Shadcn-style component harvesting.
- ADR-0004: Server-side provider gateway.
- ADR-0005: Postgres-compatible persistence.
