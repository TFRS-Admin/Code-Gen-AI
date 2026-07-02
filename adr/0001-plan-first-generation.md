# ADR-0001-Plan-First Generation

## Status

Accepted

## Context

One-shot LLM code generation produces inconsistent architecture, hidden assumptions, weak traceability, and poor reviewability.

## Decision

Every generation must produce a structured plan before code. The plan must validate against `contracts/plan.schema.json`.

## Consequences

Positive:

- Reviewers inspect intent before files exist.
- Generated code traces to plan IDs.
- Repair loops target specific tasks.
- AI tools are less likely to skip architecture.

Negative:

- Adds latency.
- Requires schema maintenance.
- Small tasks may feel heavier.

## Alternatives considered

- One-shot prompt-to-code.
- Markdown-only planning.
- Human-only planning.
