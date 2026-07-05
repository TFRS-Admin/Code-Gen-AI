# ADR-0006-WebContainers Instant Repo Preview

## Status

Accepted

## Context

ADR-0002 deferred WebContainers to "phase 2," to be evaluated once the platform
needed a full browser Node runtime. That need has arrived: users want to pick
an existing GitHub repo from the Dashboard and see it running immediately,
before Blair plans or generates anything, so they can explore the current app
and give feedback in the same place they'll watch Blair iterate on it. This is
the repo-selection flow, and it is distinct from the generation preview
(Sandpack, per ADR-0002) that renders Blair's in-progress file output for a
job.

The existing `PreviewPanel` renders a job's deployed Railway branch preview
(ADR from the `railway-preview-deploys` work) — it requires a job to exist and
a deploy to finish. There was no way to see a selected repo's current state
without first submitting a job.

## Decision

Activate WebContainers for a new, separate "instant preview" surface:

- Backend: `GET /api/repos/:owner/:repo/files?branch=` returns the repo's full
  text-file tree + contents (via the GitHub Git Trees + Blobs API), filtered
  to exclude `node_modules`, build output, VCS metadata, and secret-bearing
  dotfiles (`.env*`, `.npmrc`, etc.), and capped in file count/size to bound
  GitHub API usage and response size. Responses are cached in-memory per
  `owner/repo/branch`.
- Frontend: `WebContainersPreview` boots a `@webcontainer/api` instance in the
  browser, mounts the fetched files, runs `npm install` then the repo's
  `dev`/`start` script, and renders the resulting dev server URL in an
  iframe — no server-side build or deploy involved.
- This coexists with the existing job-based `PreviewPanel`: selecting a repo
  shows the live WebContainers preview immediately; submitting a job to
  Blair still drives the existing plan → build → QA → Railway-preview →
  PR pipeline and its own preview panel, unchanged.

## Consequences

Positive:

- Zero-deploy, sub-second-to-a-few-seconds preview of the exact repo state
  the user is about to hand to Blair.
- No production backend or Railway deploy required for browsing/interacting
  with the app before a job even runs.
- Matches the StackBlitz/CodeSandbox/Lovable "instant live preview" pattern
  users already expect.

Negative:

- Requires cross-origin isolation (COOP/COEP response headers) on both the
  Vite dev/preview server and the production static host (Caddy), which can
  affect how other cross-origin embeds on the page behave. Mitigated by using
  `Cross-Origin-Embedder-Policy: credentialless` instead of `require-corp`.
- Only works in browsers that support `SharedArrayBuffer` + cross-origin
  isolation (current Chromium-, Firefox-, and Safari-based browsers; older
  browsers are unsupported).
- Repos without a working `npm install && npm run dev|start` (non-Node
  stacks, missing scripts, native addons) will show a clear error rather than
  a preview — this is a client-side sandbox, not a general-purpose CI runner.
- New runtime dependency `@webcontainer/api` (client-side only; no server
  changes to provider gateways, per the server-side-only provider rule).

## Alternatives considered

- Leave WebContainers as an unscheduled "phase 2" and only show the repo tree
  as static, non-runnable code.
- Extend the existing Railway-based `PreviewPanel` to deploy a throwaway
  preview environment per repo selection (rejected: slow, costs a deploy per
  browse, defeats the "instant" requirement).
- Sandpack for this surface too (rejected: Sandpack mounts a React file map
  and doesn't run arbitrary repos' own `npm` scripts/servers — exactly the
  gap ADR-0002 flagged WebContainers as needed for).
