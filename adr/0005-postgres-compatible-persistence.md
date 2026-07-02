# ADR-0005-Postgres-Compatible Persistence

## Status

Accepted

## Context

The platform must trace requests, plans, component sources, generated artifacts, preview sessions, verification runs, reviews, exports, provider calls, and audit events.

## Decision

Use Postgres-compatible relational persistence.

## Consequences

Positive:

- Strong traceability.
- JSONB support for evolving plan/manifest shapes.
- Easy audit queries.
- Broad managed-vendor support.

Negative:

- Requires migrations.
- JSONB needs discipline.

## Alternatives considered

- SQLite only.
- Document database.
- Filesystem-only artifacts.
