# Gathering Results

## Success metrics

### Generation quality

| Metric | Target |
|---|---:|
| Valid plan before code | >= 90% |
| Preview boots after first build | >= 70% |
| Preview boots after one repair | >= 85% |
| Artifact traceability | 100% |
| Component manifest coverage | >= 95% |
| Custom one-shot component exceptions | <= 20% |

### Design quality

| Metric | Target |
|---|---:|
| TFRS design checklist pass rate | >= 90% |
| Accessibility smoke pass rate | >= 85% |
| Reviewer design rework requests | Down sprint over sprint |

### Engineering quality

| Metric | Target |
|---|---:|
| Generated lint/type/test pass rate | >= 85% |
| Disallowed dependency incidents | 0 |
| Secret exposure incidents | 0 |
| Unapproved exports | 0 |
| Plan-to-artifact mismatch defects | <= 10% |

## Instrumentation events

- `generation.created`
- `generation.plan.validated`
- `generation.plan.failed_validation`
- `generation.component.harvested`
- `generation.component.custom_exception`
- `generation.preview.started`
- `generation.preview.failed`
- `generation.preview.healthy`
- `generation.verification.passed`
- `generation.verification.failed`
- `generation.review.approved`
- `generation.review.changes_requested`
- `generation.export.created`

## Review rubric

| Category | 1 | 3 | 5 |
|---|---|---|---|
| Requirement match | Misses core request | Mostly matches | Fully matches |
| TFRS design fit | Generic SaaS | Partial TFRS | Strong tactical command deck |
| Code quality | Spaghetti | Acceptable | Modular, typed, tested |
| Component provenance | Unknown | Partial | Complete manifests |
| Preview stability | Fails | Boots with warnings | Boots cleanly |
| Export readiness | Not usable | Needs cleanup | PR-ready |

## Pilot evaluation template

```md
# Pilot Evaluation

generation_id:
scenario:
reviewer:
date:

## Scores

requirement_match:
design_fit:
code_quality:
component_provenance:
preview_stability:
export_readiness:

## Metrics

time_to_plan:
time_to_preview:
repair_passes:
harvested_component_count:
custom_component_count:
verification_status:

## Decision

approved / changes_requested / rejected
```

## Definition of MVP success

A contractor team can generate, preview, review, and export three TFRS-aligned screens while maintaining provenance, security, and plan-first discipline.
