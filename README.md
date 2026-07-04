# Code-Gen-AI: GitHub-Connected AI Dev Agent Dashboard

**AI Assistant Personality:** Blair
**Niche:** Run AI coding agents against real GitHub repos with branch previews, QA, and PRs.

## The Vision

Code-Gen-AI is not a generic "build an app from a prompt" tool. It is an orchestration product built around AI agents. 

We provide the **runtime infrastructure** that sits between a model (like Claude, OpenAI, or local Ollama) and a GitHub repository. Instead of fighting with consumer credit limits and copy-pasting code, you use Blair as a dashboard to manage the full developer lifecycle.

### The MVP Workflow
1. **Connect GitHub repo**
2. **Select base branch**
3. **Paste prompt** (or run the Consultation phase)
4. **Agent creates feature branch**
5. **Runs implementation in sandbox** (Docker/Vite)
6. **Runs QA** (npm lint/build/typecheck/test)
7. **Opens live preview URL**
8. **Shows diff**
9. **Opens PR**

## Architecture

- **Frontend:** React/Vite dashboard
- **Backend:** Node.js/Express (Job Runner & Orchestrator)
- **Database:** Postgres (Job history, plans, audit trails)
- **Preview:** Vite dev server per branch, exposed through a reverse proxy
- **Deployment:** Railway (Handles frontend, backend, Postgres, and background jobs natively)

## Reading order for Contractors/AI

1. `docs/00-documentation-map.md`
2. `docs/01-main-spec.md`
3. `docs/03-system-architecture.md`
4. `docs/05-agent-lifecycle.md`
5. `docs/10-data-model.md`
6. `docs/14-milestones.md`

## AI tool entry points

- `CLAUDE.md`
- `.cursor/rules/blair-agent-lifecycle.mdc`
- `.github/copilot-instructions.md`
- `prompts/blair-system-prompt.md`

## Executable contracts

- `contracts/plan.schema.json`
- `contracts/generation-request.schema.json`
- `contracts/component-manifest.schema.json`
- `contracts/openapi.yaml`
- `contracts/tfrs-schema-registry.md`
