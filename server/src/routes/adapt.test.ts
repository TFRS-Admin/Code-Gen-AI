import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAdaptRouter, AdaptRouterDeps } from './adapt';
import { errorHandler } from '../middleware';
import type { RegistryComponentRow } from '../services/harvester/store';
import type { ComponentManifest, ComponentManifestRow } from '../services/harvester/manifest-store';

const unusedDeps: AdaptRouterDeps = {
  getRegistryComponentById: async () => {
    throw new Error('getRegistryComponentById should not be called in this test');
  },
  persistManifest: async () => {
    throw new Error('persistManifest should not be called in this test');
  },
};

/** A persistManifest stub that records every manifest it's asked to store and echoes back a fake persisted row. */
function recordingPersistManifest() {
  const persisted: ComponentManifest[] = [];
  const persistManifest: AdaptRouterDeps['persistManifest'] = async (manifest) => {
    persisted.push(manifest);
    return {
      id: `row-${persisted.length}`,
      created_at: '2026-07-05T10:00:00.000Z',
      job_id: null,
      plan_id: null,
      manifest_id: manifest.manifestId,
      generation_plan_id: manifest.generationPlanId,
      requirement_id: manifest.requirementId,
      component_name: manifest.componentName,
      source_type: manifest.sourceType,
      source_name: manifest.sourceName,
      source_url: manifest.sourceUrl ?? null,
      license: manifest.license,
      score: manifest.score,
      original_files: manifest.originalFiles,
      adapted_files: manifest.adaptedFiles,
      dependencies_added: manifest.dependenciesAdded,
      dependencies_removed: manifest.dependenciesRemoved,
      tfrs_adaptations: manifest.tfrsAdaptations,
      risk_notes: manifest.riskNotes,
      custom_build_exception: manifest.customBuildException ?? null,
    } satisfies ComponentManifestRow;
  };
  return { persisted, persistManifest };
}

/** Starts an ephemeral-port Express app mounting the adapt router (mirrors real mounting at /api/adapt), runs fn, then tears it down. */
async function withServer<T>(deps: AdaptRouterDeps, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use('/api/adapt', createAdaptRouter(deps));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}/api/adapt`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function row(overrides: Partial<RegistryComponentRow> = {}): RegistryComponentRow {
  return {
    id: 'row-1',
    name: 'button',
    source: 'shadcn',
    category: 'form',
    version: 'latest',
    license: 'MIT',
    dependencies: ['clsx'],
    tfrs_classes: [],
    description: null,
    discovered_at: '2026-07-05T10:00:00.000Z',
    updated_at: '2026-07-05T10:00:00.000Z',
    ...overrides,
  };
}

test('POST /api/adapt/component: adapts componentCode and returns the TFRS classes applied', async () => {
  const { persistManifest } = recordingPersistManifest();
  await withServer({ ...unusedDeps, persistManifest }, async (baseUrl) => {
    const res = await fetch(baseUrl + '/component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentCode: '<button className="bg-blue-500 text-white">Click</button>' }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.data.adaptedCode.includes('bg-tfrs-red'));
    assert.ok(body.data.adaptedCode.includes('text-tfrs-ink'));
    assert.ok(body.data.tfrsClasses.includes('bg-tfrs-red'));
    assert.equal(body.data.componentMetadata, null);
  });
});

test('POST /api/adapt/component: looks up component metadata by id when provided', async () => {
  const match = row({ id: 'row-42', name: 'button-1' });
  let calledWith: unknown;
  const { persistManifest } = recordingPersistManifest();
  const deps: AdaptRouterDeps = {
    ...unusedDeps,
    persistManifest,
    getRegistryComponentById: async (id) => {
      calledWith = id;
      return match;
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentCode: '<div className="p-4">x</div>', componentId: 'row-42' }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.equal(calledWith, 'row-42');
    assert.deepEqual(body.data.componentMetadata, match);
  });
});

test('POST /api/adapt/component: returns null componentMetadata when the id has no match', async () => {
  const { persistManifest } = recordingPersistManifest();
  const deps: AdaptRouterDeps = {
    ...unusedDeps,
    persistManifest,
    getRegistryComponentById: async () => null,
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentCode: '<div className="p-4">x</div>', componentId: 'missing-id' }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.equal(body.data.componentMetadata, null);
  });
});

test('POST /api/adapt/component: rejects an empty componentCode with a 400 validation error', async () => {
  await withServer(unusedDeps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentCode: '' }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});

test('POST /api/adapt/component: builds and persists a manifest matching the schema, returned in the response', async () => {
  const match = row({ id: 'row-42', name: 'TacticalButton', source: 'internal', license: 'proprietary' });
  const { persisted, persistManifest } = recordingPersistManifest();
  const deps: AdaptRouterDeps = {
    getRegistryComponentById: async () => match,
    persistManifest,
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        componentCode: '<button className="bg-blue-500">Go</button>',
        componentId: 'row-42',
        requirementId: 'comp_need_cta_001',
        jobId: 'job-uuid-1',
        planId: 'plan-uuid-1',
      }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.equal(persisted.length, 1, 'persistManifest should be called exactly once');

    const manifest = body.data.manifest;
    assert.match(manifest.manifestId, /^hc_[A-Za-z0-9_-]+$/);
    assert.equal(manifest.generationPlanId, 'plan_plan-uuid-1');
    assert.equal(manifest.requirementId, 'comp_need_cta_001');
    assert.equal(manifest.componentName, 'TacticalButton');
    assert.equal(manifest.sourceType, 'internal');
    assert.equal(manifest.license, 'proprietary');
    assert.deepEqual(manifest, persisted[0]);
  });
});

test('POST /api/adapt/component: persists a custom-source manifest when no componentId is given', async () => {
  const { persisted, persistManifest } = recordingPersistManifest();
  await withServer({ ...unusedDeps, persistManifest }, async (baseUrl) => {
    const res = await fetch(baseUrl + '/component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentCode: '<div className="p-4">custom</div>' }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.equal(persisted.length, 1);
    assert.equal(body.data.manifest.sourceType, 'custom');
    assert.ok(body.data.manifest.riskNotes.length > 0);
  });
});

test('POST /api/adapt/batch: adapts multiple components and preserves their ids/order', async () => {
  const { persistManifest } = recordingPersistManifest();
  await withServer({ ...unusedDeps, persistManifest }, async (baseUrl) => {
    const res = await fetch(baseUrl + '/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        components: [
          { id: 'btn-1', code: '<button className="bg-blue-500">A</button>' },
          { id: 'btn-2', code: '<button className="bg-gray-100">B</button>' },
        ],
      }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].id, 'btn-1');
    assert.ok(body.data[0].adaptedCode.includes('bg-tfrs-red'));
    assert.equal(body.data[1].id, 'btn-2');
    assert.ok(body.data[1].adaptedCode.includes('bg-tfrs-surface'));
  });
});

test('POST /api/adapt/batch: rejects an empty components array with a 400 validation error', async () => {
  await withServer(unusedDeps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ components: [] }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});

test('POST /api/adapt/batch: builds and persists one manifest per adapted component, each with a distinct manifestId', async () => {
  const { persisted, persistManifest } = recordingPersistManifest();
  await withServer({ ...unusedDeps, persistManifest }, async (baseUrl) => {
    const res = await fetch(baseUrl + '/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        components: [
          { id: 'btn-1', code: '<button className="bg-blue-500">A</button>' },
          { id: 'btn-2', code: '<button className="bg-gray-100">B</button>' },
        ],
      }),
    });
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.equal(persisted.length, 2, 'persistManifest should be called once per component');

    assert.equal(body.data[0].manifest.requirementId, 'btn-1');
    assert.equal(body.data[1].manifest.requirementId, 'btn-2');
    assert.notEqual(body.data[0].manifest.manifestId, body.data[1].manifest.manifestId);
    for (const item of body.data) {
      assert.match(item.manifest.manifestId, /^hc_[A-Za-z0-9_-]+$/);
      assert.match(item.manifest.generationPlanId, /^plan_[A-Za-z0-9_-]+$/);
    }
  });
});
