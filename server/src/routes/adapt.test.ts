import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAdaptRouter, AdaptRouterDeps } from './adapt';
import { errorHandler } from '../middleware';
import type { RegistryComponentRow } from '../services/harvester/store';

const unusedDeps: AdaptRouterDeps = {
  getRegistryComponentById: async () => {
    throw new Error('getRegistryComponentById should not be called in this test');
  },
};

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
  await withServer(unusedDeps, async (baseUrl) => {
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
  const deps: AdaptRouterDeps = {
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
  const deps: AdaptRouterDeps = {
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

test('POST /api/adapt/batch: adapts multiple components and preserves their ids/order', async () => {
  await withServer(unusedDeps, async (baseUrl) => {
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
