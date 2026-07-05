import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createRegistryRouter, RegistryRouterDeps } from './registry';
import { errorHandler } from '../middleware';
import type { RegistryComponentRow } from '../services/harvester/store';

const unusedDeps: RegistryRouterDeps = {
  listRegistryComponents: async () => {
    throw new Error('listRegistryComponents should not be called in this test');
  },
  searchRegistryComponents: async () => {
    throw new Error('searchRegistryComponents should not be called in this test');
  },
  syncRegistry: async () => {
    throw new Error('syncRegistry should not be called in this test');
  },
};

/** Starts an ephemeral-port Express app mounting the registry router (mirrors real mounting at /api/registry), runs fn, then tears it down. */
async function withServer<T>(deps: RegistryRouterDeps, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use('/api/registry', createRegistryRouter(deps));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}/api/registry`);
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

test('GET /api/registry/components: lists all components when no query params are given', async () => {
  const rows = [row({ id: 'row-1' }), row({ id: 'row-2', name: 'card' })];
  let calledWith: unknown;
  const deps: RegistryRouterDeps = {
    ...unusedDeps,
    listRegistryComponents: async (source) => {
      calledWith = source;
      return rows;
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/components');
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, data: rows });
    assert.equal(calledWith, undefined);
  });
});

test('GET /api/registry/components?source=internal: passes the source filter through to the store', async () => {
  let calledWith: unknown;
  const deps: RegistryRouterDeps = {
    ...unusedDeps,
    listRegistryComponents: async (source) => {
      calledWith = source;
      return [];
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/components?source=internal');
    assert.equal(res.status, 200);
    assert.equal(calledWith, 'internal');
  });
});

test('GET /api/registry/components?source=bogus: ignores an invalid source value instead of passing it through', async () => {
  let calledWith: unknown;
  const deps: RegistryRouterDeps = {
    ...unusedDeps,
    listRegistryComponents: async (source) => {
      calledWith = source;
      return [];
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/components?source=bogus');
    assert.equal(res.status, 200);
    assert.equal(calledWith, undefined);
  });
});

test('GET /api/registry/components?q=dialog: searches instead of listing when q is present', async () => {
  const rows = [row({ id: 'row-3', name: 'dialog', category: 'overlay' })];
  let calledWith: unknown;
  const deps: RegistryRouterDeps = {
    ...unusedDeps,
    searchRegistryComponents: async (q) => {
      calledWith = q;
      return rows;
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/components?q=dialog');
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, data: rows });
    assert.equal(calledWith, 'dialog');
  });
});

test('GET /api/registry/components: returns a generic 500 without leaking internal error details when the store fails', async () => {
  const deps: RegistryRouterDeps = {
    ...unusedDeps,
    listRegistryComponents: async () => {
      const dbErr: any = new Error('relation "registry_components" does not exist');
      dbErr.code = '42P01';
      throw dbErr;
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/components');
    const body = (await res.json()) as any;
    assert.equal(res.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
  });
});

test('POST /api/registry/sync: runs the sync and returns per-source counts', async () => {
  const result = [
    { source: 'internal' as const, count: 8 },
    { source: 'shadcn' as const, count: 15 },
  ];
  let called = false;
  const deps: RegistryRouterDeps = {
    ...unusedDeps,
    syncRegistry: async () => {
      called = true;
      return result;
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl + '/sync', { method: 'POST' });
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, data: result });
    assert.ok(called);
  });
});
