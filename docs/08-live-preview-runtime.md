# Live Preview Runtime

## Purpose

The live preview replaces the static iframe with a hot-reloading React preview that can execute generated UI in the browser before export.

## Two preview surfaces

As of ADR-0006, the Dashboard has two distinct, coexisting preview surfaces:

| Surface | Component | Triggered by | Runtime |
|---|---|---|---|
| Instant repo preview | `WebContainersPreview` | Selecting a repo + branch | `@webcontainer/api`, runs the repo's own `npm install && npm run dev\|start` in-browser |
| Generation/job preview | `PreviewPanel` | Submitting a job to Blair | Railway branch deploy (job-specific), iframe to the deployed URL |

The instant repo preview requires no job and no backend deploy — it lets a
user browse and interact with the exact repo state before asking Blair to
change anything. See ADR-0006 for the full decision record and
`GET /api/repos/:owner/:repo/files` for the backend contract that feeds it.

## MVP recommendation

Use **Sandpack** for MVP.

Rationale:

- Designed for live coding environments.
- Mounts a React file map directly.
- Lower complexity than a full browser Node runtime.
- Sufficient for React-only UI drafting.

## Phase 2 recommendation

Evaluate **WebContainers** when the platform needs:

- browser-based Node runtime,
- package manager commands,
- Express/Fastify server simulation,
- terminal-like developer experience,
- full-stack generated app preview.

## Decision table

| Need | Sandpack | WebContainers |
|---|---|---|
| React component preview | Strong | Strong |
| Fast MVP integration | Strong | Medium |
| Full Node process | Limited | Strong |
| Express server in browser | Limited | Strong |
| Operational complexity | Lower | Higher |

## Preview bundle

```ts
export interface PreviewFile {
  path: string;
  code: string;
  active?: boolean;
  hidden?: boolean;
  readOnly?: boolean;
}

export interface PreviewBundle {
  generationId: string;
  planId: string;
  template: "react" | "react-ts" | "vite-react" | "vite-react-ts";
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  files: PreviewFile[];
  entryFile: string;
}
```

## Sandpack sketch

```tsx
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
  SandpackCodeEditor
} from "@codesandbox/sandpack-react";

export function PreviewPanel({ bundle }: { bundle: PreviewBundle }) {
  const files = Object.fromEntries(
    bundle.files.map((file) => [
      file.path,
      { code: file.code, active: file.active, hidden: file.hidden, readOnly: file.readOnly }
    ])
  );

  return (
    <SandpackProvider
      template="react"
      files={files}
      customSetup={{ dependencies: bundle.dependencies }}
      options={{ activeFile: bundle.entryFile, autorun: true }}
    >
      <SandpackLayout>
        <SandpackCodeEditor showTabs showLineNumbers />
        <SandpackPreview showNavigator showRefreshButton />
      </SandpackLayout>
    </SandpackProvider>
  );
}
```

## Sandbox rules

- Never inject provider API keys.
- Never mount `.env` values.
- Replace backend calls with mock adapters.
- Use deterministic mock data from the plan’s data model.
- Capture build/runtime/console errors.
- Block unapproved external scripts.
- Limit dependencies to manifest.

## Mock data strategy

Generated preview must not require production backend deployment.

```ts
export const mockQuoteRequests = [
  {
    id: "qr_001",
    customerName: "Fortress Supply Group",
    status: "awaiting-review",
    total: 12840,
    createdAt: "2026-07-02T10:00:00Z"
  }
];
```

## Error repair loop

1. Preview emits error.
2. API persists preview error log.
3. Orchestrator creates verification failure.
4. Blair receives plan, files, exact error log, dependency manifest.
5. Blair returns minimal patch.
6. Preview remounts.
7. Repair count increments.

## Acceptance criteria

- Generated React file map renders.
- Build/runtime errors are visible.
- Errors are persisted.
- Mock-only screens run without backend.
- No secrets in preview bundle.
