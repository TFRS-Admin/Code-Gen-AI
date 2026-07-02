# ADR-0002-Sandpack MVP Preview with WebContainers Phase 2

## Status

Accepted

## Context

The current platform uses a static iframe. The target platform needs live React preview before export.

## Decision

Use Sandpack for MVP live React previews. Evaluate WebContainers in phase 2 for full Node/browser runtime needs.

## Consequences

Positive:

- Fast MVP.
- Direct React file map support.
- Lower complexity.

Negative:

- Limited server simulation.
- Some dependency cases may need WebContainers later.

## Alternatives considered

- Static iframe.
- Custom Vite dev server per generation.
- WebContainers as MVP.
- Remote containers.
