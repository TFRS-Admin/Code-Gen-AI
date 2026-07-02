# ADR-0003-Radix-Shadcn-Style Component Harvesting

## Status

Accepted

## Context

The platform prioritizes component stitching over from-scratch UI generation. Existing repos use Tailwind, Radix, and Shadcn-style local components.

## Decision

Prefer internal TFRSupply components and Radix/Shadcn-style copied components. Avoid heavy UI frameworks by default.

## Consequences

Positive:

- Local, auditable components.
- Preserves Tailwind/TFRS control.
- Reduces dependency weight.
- Supports accessibility through Radix primitives.

Negative:

- Requires adaptation work.
- Requires source/license tracking.

## Alternatives considered

- Heavy UI frameworks.
- Generate all UI from scratch.
- Remote component runtime packages.
