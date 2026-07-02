# ADR-0004-Server-Side Provider Gateway

## Status

Accepted

## Context

The platform calls direct LLM APIs. Browser-side calls expose keys and reduce governance.

## Decision

All LLM provider calls go through a server-side provider gateway.

## Consequences

Positive:

- Protects secrets.
- Centralizes logging, rate limits, timeouts, and provider switching.
- Enables validation before lifecycle transitions.
- Supports audit and cost tracking.

Negative:

- Requires backend service.
- Requires secure secret management.

## Alternatives considered

- Direct browser calls.
- Local AI tool only.
- Third-party proxy service.
