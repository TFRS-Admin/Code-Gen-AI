# Repository Contracts

## `Code-Gen-AI`

### Role

Primary generator application where users interact with Blair, generate plans, preview code, and export artifacts.

### Current state

- `src/components/generator/GeneratorForm.jsx`
- `PreviewPanel.jsx`
- Static iframe preview of generated HTML.

### Target state

- React/Vite generator UI.
- Server-side LLM gateway.
- Plan-first orchestration.
- Live React preview.
- Component harvester.
- Artifact export workflow.

### Proposed structure

```text
Code-Gen-AI/
  src/
    components/generator/
      GeneratorForm.jsx
      PreviewPanel.jsx
      FileTree.tsx
      ReviewDrawer.tsx
      GenerationTimeline.tsx
    components/theme/TfrsThemeProvider.tsx
    components/ui/
    hooks/useGeneration.ts
    hooks/usePreviewSession.ts
    lib/apiClient.ts
    lib/cn.ts
    lib/tfrsTokens.ts
  server/
    routes/
    services/orchestrator/
    services/providers/
    services/harvester/
    services/preview/
    services/export/
    services/audit/
    db/
  contracts/
  CLAUDE.md
```

## `TFRSupply-frontend`

### Role

Source of truth for TFRS design-system tokens and reusable UI widgets.

### Contract

Generated apps inherit:

- `components.json` conventions.
- Tailwind tokens/classes.
- `src/components/ui/` patterns.
- `cn()` utility using `clsx` and `tailwind-merge`.
- Radix-based primitives.
- TFRS colors, typography, and interaction states.

### Required harvester exports

```text
TFRSupply-frontend/
  src/components/ui/
  src/components/tfrs/
    CommandCard.tsx
    TacticalButton.tsx
    MetricPanel.tsx
    StatusBadge.tsx
    SpecTable.tsx
  src/lib/cn.ts
  src/lib/tfrsTokens.ts
  components.json
  tailwind.config.js or app.css theme tokens
  docs/component-catalog.md
```

## `tfrsupply-storefront`

### Role

Production e-commerce and quoting target.

### Contract

- React/Vite client.
- Express/Node server.
- `wouter` routing.
- Generated code accepted only by reviewed branch/PR.
- No direct mutation by generation jobs without human approval.

### Generated code landing pattern

```text
client/src/pages/generated/<feature-name>/
client/src/components/generated/<feature-name>/
client/src/lib/generated/<feature-name>/
server/routes/generated/<feature-name>.ts  # only if approved
docs/generated/<generation-id>.md
```

## Cross-repo rules

1. Start from `develop`.
2. Work under `feature/<scope>-<description>`.
3. Generated files should include traceability comments.
4. No secrets committed.
5. No generated dependency without manifest review.
6. No target repo export without verification summary.
