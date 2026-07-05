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

## WebContainers instant repo preview

Selecting a repo on the Dashboard boots an in-browser [WebContainers](https://webcontainers.io)
runtime (`@webcontainer/api`) that mounts the repo's files and runs its own
`npm install && npm run dev|start` — no server-side deploy involved. This is
separate from (and coexists with) the job-based `PreviewPanel`, which shows
Blair's Railway branch deploy once a job is submitted. See
`adr/0006-webcontainers-instant-preview.md` and `docs/08-live-preview-runtime.md`
for the full design.

Setup notes:

- **No API key required.** `@webcontainer/api` runs entirely client-side; it
  doesn't use `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` or any other provider
  credential (those stay server-side per this repo's provider-gateway rule).
- **Cross-origin isolation is required.** WebContainers needs
  `SharedArrayBuffer`, which browsers only expose on cross-origin-isolated
  pages. `Cross-Origin-Embedder-Policy: credentialless` and
  `Cross-Origin-Opener-Policy: same-origin` are set in `vite.config.js`
  (dev/`vite preview`) and `Caddyfile` (production). If you front this app
  with a different host/CDN, mirror those two headers there too.
- **Outbound network access is required** to `stackblitz.com` and
  `*.webcontainer-api.io` at runtime (the browser fetches the WebContainers
  boot payload and hosts the live preview iframe there). Environments with
  restrictive egress allowlists will need those domains added; without them,
  the preview panel shows a clear error instead of hanging.
- **Browser support:** current Chromium-, Firefox-, or Safari-based browsers.
  Older browsers without cross-origin isolation support will show the
  "isn't cross-origin isolated" error state.
- A repo needs a `package.json` with a `dev` or `start` script to preview;
  repos without one (or without a working Node toolchain) show a clear error.

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
