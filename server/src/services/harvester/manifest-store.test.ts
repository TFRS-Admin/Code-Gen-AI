import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManifest,
  validateManifest,
  manifestToRow,
  rowToManifest,
  ComponentManifestSchema,
} from './manifest-store';
import type { RegistryComponentRow } from './store';

function registryRow(overrides: Partial<RegistryComponentRow> = {}): RegistryComponentRow {
  return {
    id: 'row-1',
    name: 'TacticalCard',
    source: 'internal',
    category: 'data-display',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['clsx', 'class-variance-authority'],
    tfrs_classes: ['bg-tfrs-surface'],
    description: null,
    discovered_at: '2026-07-05T10:00:00.000Z',
    updated_at: '2026-07-05T10:00:00.000Z',
    ...overrides,
  };
}

test('buildManifest: sources fields from componentMetadata when a registry match is provided', () => {
  const manifest = buildManifest({
    requirementId: 'comp_need_hero_001',
    tfrsClasses: ['bg-tfrs-red', 'text-tfrs-ink'],
    componentMetadata: registryRow(),
    planId: 'plan-uuid-123',
  });

  assert.equal(manifest.requirementId, 'comp_need_hero_001');
  assert.equal(manifest.componentName, 'TacticalCard');
  assert.equal(manifest.sourceType, 'internal');
  assert.equal(manifest.sourceName, 'TacticalCard');
  assert.equal(manifest.license, 'proprietary');
  assert.deepEqual(manifest.dependenciesAdded, ['clsx', 'class-variance-authority']);
  assert.deepEqual(manifest.dependenciesRemoved, []);
  assert.deepEqual(manifest.tfrsAdaptations, ['bg-tfrs-red', 'text-tfrs-ink']);
  assert.equal(manifest.generationPlanId, 'plan_plan-uuid-123');
  assert.equal(manifest.customBuildException, undefined);
});

test('buildManifest: records an unmatched/custom source honestly when no registry component matched', () => {
  const manifest = buildManifest({
    tfrsClasses: ['bg-tfrs-surface'],
    componentMetadata: null,
  });

  assert.equal(manifest.sourceType, 'custom');
  assert.equal(manifest.sourceName, 'custom');
  assert.equal(manifest.license, 'unknown');
  assert.equal(manifest.score, 0);
  assert.ok(manifest.riskNotes.length > 0, 'should flag unknown provenance as a risk note');
  assert.ok(manifest.customBuildException);
  assert.equal(manifest.componentName, 'unnamed-component');
});

test('buildManifest: falls back to a synthesized requirementId/generationPlanId when none is given', () => {
  const manifest = buildManifest({
    tfrsClasses: [],
    componentMetadata: null,
  });

  assert.ok(manifest.requirementId.startsWith('adhoc_'), 'requirementId should be a synthesized placeholder');
  assert.ok(manifest.generationPlanId.startsWith('plan_adhoc_'), 'generationPlanId should be a synthesized placeholder');
});

test('buildManifest: mints IDs that satisfy the manifest schema prefix requirements', () => {
  const manifest = buildManifest({ tfrsClasses: [], componentMetadata: registryRow() });

  assert.match(manifest.manifestId, /^hc_[A-Za-z0-9_-]+$/);
  assert.match(manifest.generationPlanId, /^plan_[A-Za-z0-9_-]+$/);
});

test('buildManifest: always returns a manifest that validates against the schema', () => {
  const matched = buildManifest({ tfrsClasses: ['bg-tfrs-red'], componentMetadata: registryRow() });
  const unmatched = buildManifest({ tfrsClasses: [], componentMetadata: null });

  assert.deepEqual(validateManifest(matched), { valid: true, errors: [] });
  assert.deepEqual(validateManifest(unmatched), { valid: true, errors: [] });
});

test('validateManifest: rejects a manifest with a malformed manifestId prefix', () => {
  const manifest = buildManifest({ tfrsClasses: [], componentMetadata: registryRow() });
  const broken = { ...manifest, manifestId: 'not-a-valid-id' };

  const result = validateManifest(broken);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('manifestId')));
});

test('validateManifest: rejects a manifest missing a required field', () => {
  const manifest = buildManifest({ tfrsClasses: [], componentMetadata: registryRow() });
  const { license, ...withoutLicense } = manifest;

  const result = validateManifest(withoutLicense);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('license')));
});

test('validateManifest: rejects a score outside the 0-100 range', () => {
  const manifest = buildManifest({ tfrsClasses: [], componentMetadata: registryRow() });
  const result = validateManifest({ ...manifest, score: 101 });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('score')));
});

test('manifestToRow -> rowToManifest: a persisted manifest can be fetched and reconstructed unchanged', () => {
  // Exercises the same field mapping persistManifest/getManifestById use
  // internally. There is no live Postgres in this test environment (no
  // server/src test touches db/client directly — confirmed by grep), so this
  // is a round-trip through the row-shape mapping rather than a live INSERT
  // + SELECT; it proves the mapping is lossless, which is what a real DB
  // round-trip additionally depends on.
  const manifest = buildManifest({
    requirementId: 'comp_need_hero_001',
    tfrsClasses: ['bg-tfrs-red'],
    componentMetadata: registryRow(),
    planId: 'plan-uuid-123',
  });

  const row = manifestToRow(manifest, { jobId: 'job-uuid-456', planId: 'plan-uuid-123' });
  assert.equal(row.job_id, 'job-uuid-456');
  assert.equal(row.plan_id, 'plan-uuid-123');

  // Simulates what `pg` hands back from `SELECT *` (jsonb columns already
  // parsed into JS arrays) by adding the DB-only id/created_at columns.
  const fakePersistedRow = { ...row, id: 'internal-row-uuid', created_at: '2026-07-05T10:00:00.000Z' };
  const reconstructed = rowToManifest(fakePersistedRow);

  assert.deepEqual(reconstructed, manifest);
});

test('manifestToRow: defaults job_id/plan_id to null when no context is given', () => {
  const manifest = buildManifest({ tfrsClasses: [], componentMetadata: registryRow() });
  const row = manifestToRow(manifest);

  assert.equal(row.job_id, null);
  assert.equal(row.plan_id, null);
});

test('ComponentManifestSchema: rejects unknown properties (mirrors additionalProperties: false in the contract)', () => {
  const manifest = buildManifest({ tfrsClasses: [], componentMetadata: registryRow() });
  const result = ComponentManifestSchema.safeParse({ ...manifest, extraField: 'nope' });

  assert.equal(result.success, false);
});
