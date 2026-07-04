# MVP Epics and Tickets

## Epic 1 — Documentation and contracts

- TICKET-001: Commit documentation suite.
- TICKET-002: Add JSON schemas.
- TICKET-003: Add schema validation tests.
- TICKET-004: Add AI tool instructions.

## Epic 2 — Backend foundation

- TICKET-005: Create Express server skeleton.
- TICKET-006: Add request ID and error envelope middleware.
- TICKET-007: Add database migrations.
- TICKET-008: Implement generation request persistence.
- TICKET-009: Implement audit event service.

## Epic 3 — Provider gateway

- TICKET-010: Define provider gateway interface.
- TICKET-011: Implement mock provider.
- TICKET-012: Implement OpenAI provider adapter.
- TICKET-013: Implement Anthropic provider adapter.
- TICKET-014: Add provider call logging.
- TICKET-015: Add structured plan prompt and validation.

## Epic 4 — Orchestration

- TICKET-016: Implement lifecycle state machine.
- TICKET-017: Block build without valid plan.
- TICKET-018: Implement plan revisioning.
- TICKET-019: Implement repair attempt tracking.
- TICKET-020: Add lifecycle SSE events.

## Epic 5 — Live preview

- TICKET-021: Replace static iframe with Sandpack preview.
- TICKET-022: Implement preview bundle mapper.
- TICKET-023: Add mock data injection.
- TICKET-024: Capture preview errors.
- TICKET-025: Persist preview session results.

## Epic 6 — Component harvester

- TICKET-026: Implement registry adapter interface.
- TICKET-027: Implement internal TFRSupply adapter.
- TICKET-028: Implement Shadcn/Radix adapter.
- TICKET-029: Implement candidate scoring.
- TICKET-030: Implement TFRS adaptation rules.
- TICKET-031: Persist component manifests.

## Epic 7 — Verification and export

- TICKET-032: Implement verification runs.
- TICKET-033: Add review decisions.
- TICKET-034: Add ZIP export.
- TICKET-035: Add Git patch export.
- TICKET-036: Add export manifest and checksums.
