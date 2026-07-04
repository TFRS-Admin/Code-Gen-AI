# API Contracts

## API style

MVP uses an Express/Node REST API. Streaming lifecycle updates can be delivered using Server-Sent Events.

Base path:

```text
/api
```

## Common response envelope

```ts
export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}
```

## Endpoints

### Health

```http
GET /api/health
```

### Create generation

```http
POST /api/generations
```

Body: `contracts/generation-request.schema.json`

Response:

```json
{
  "ok": true,
  "data": {
    "generationId": "gen_01...",
    "status": "draft_request"
  },
  "requestId": "req_..."
}
```

### Get generation

```http
GET /api/generations/{generationId}
```

Returns request, current plan, lifecycle state, latest verification, and export status.

### Stream generation events

```http
GET /api/generations/{generationId}/events
Accept: text/event-stream
```

Event types:

- `generation.created`
- `generation.planning`
- `generation.plan_ready`
- `generation.harvesting`
- `generation.building`
- `generation.verifying`
- `generation.preview_ready`
- `generation.review_ready`
- `generation.export_ready`
- `generation.failed`

### Create or revise plan

```http
POST /api/generations/{generationId}/plan
```

### Approve plan

```http
POST /api/generations/{generationId}/plan/approve
```

### Build artifacts

```http
POST /api/generations/{generationId}/build
```

Requires valid plan.

### Get files

```http
GET /api/generations/{generationId}/files
```

### Create preview session

```http
POST /api/generations/{generationId}/preview-sessions
```

Returns `PreviewBundle`.

### Report preview result

```http
POST /api/preview-sessions/{previewSessionId}/result
```

### Run verification

```http
POST /api/generations/{generationId}/verify
```

### Review generation

```http
POST /api/generations/{generationId}/review
```

Body:

```json
{
  "decision": "changes_requested",
  "notes": "CTA color does not match TFRS primary command pattern.",
  "checklist": {
    "matches_request": true,
    "design_system": false,
    "preview_boots": true,
    "dependencies_reviewed": true
  }
}
```

### Export generation

```http
POST /api/generations/{generationId}/exports
```

Body:

```json
{ "type": "zip" }
```

## Error codes

| Code | Meaning |
|---|---|
| `VALIDATION_FAILED` | Body or generated plan does not match schema |
| `PROVIDER_UNAVAILABLE` | Provider failed or timed out |
| `PLAN_REQUIRED` | Build requested before valid plan |
| `PLAN_NOT_APPROVED` | Build requires approval |
| `HARVEST_FAILED` | Component harvesting failed |
| `PREVIEW_FAILED` | Preview bundle failed |
| `EXPORT_NOT_APPROVED` | Export requested before review approval |
| `UNAUTHORIZED` | Missing/invalid auth |
| `FORBIDDEN` | User lacks permission |
| `RATE_LIMITED` | User/project/provider limit exceeded |

## Provider gateway

```ts
export interface ProviderGateway {
  createPlan(input: CreatePlanInput): Promise<StructuredPlanResult>;
  generateFiles(input: GenerateFilesInput): Promise<GeneratedFileResult>;
  repairFiles(input: RepairFilesInput): Promise<GeneratedFileResult>;
}
```

## Provider call logging

Every provider call records:

- provider,
- model,
- purpose,
- generation ID,
- plan ID if available,
- token usage if available,
- latency,
- status,
- redacted request hash,
- redacted response hash,
- error code if failed.
