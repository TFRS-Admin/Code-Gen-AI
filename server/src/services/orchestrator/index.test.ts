import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewUrl, pollPreviewReady } from './index';
import { config } from '../../config';

/** Runs fn with config.railway.projectId set to value, then restores the original. */
async function withRailwayProjectId<T>(value: string, fn: () => Promise<T> | T): Promise<T> {
  const original = config.railway.projectId;
  config.railway.projectId = value;
  try {
    return await fn();
  } finally {
    config.railway.projectId = original;
  }
}

test('buildPreviewUrl: constructs the Railway preview URL from the branch name and project id', async () => {
  await withRailwayProjectId('proj-abc123', () => {
    const url = buildPreviewUrl('feature/blair-a1b2c3d4');
    assert.equal(url, 'https://feature-blair-a1b2c3d4-proj-abc123.railway.app');
  });
});

test('buildPreviewUrl: lowercases and collapses non-alphanumeric characters in the branch name', async () => {
  await withRailwayProjectId('proj-abc123', () => {
    const url = buildPreviewUrl('Feature/BLAIR_Test--Branch!!');
    assert.equal(url, 'https://feature-blair-test-branch-proj-abc123.railway.app');
  });
});

test('buildPreviewUrl: returns null when RAILWAY_PROJECT_ID is not configured', async () => {
  await withRailwayProjectId('', () => {
    const url = buildPreviewUrl('feature/blair-a1b2c3d4');
    assert.equal(url, null);
  });
});

test('pollPreviewReady: returns true immediately when the first response is 200', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return { status: 200 } as Response;
  }) as unknown as typeof fetch;

  const ready = await pollPreviewReady('https://example.railway.app', {
    fetchImpl,
    sleepImpl: async () => {},
  });

  assert.equal(ready, true);
  assert.equal(calls, 1);
});

test('pollPreviewReady: keeps polling through non-200 responses until one succeeds', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return { status: calls < 3 ? 503 : 200 } as Response;
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];

  const ready = await pollPreviewReady('https://example.railway.app', {
    intervalMs: 5000,
    timeoutMs: 60000,
    fetchImpl,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.equal(ready, true);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [5000, 5000]);
});

test('pollPreviewReady: keeps polling through fetch errors (deploy not reachable yet)', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    if (calls < 2) throw new Error('ENOTFOUND example.railway.app');
    return { status: 200 } as Response;
  }) as unknown as typeof fetch;

  const ready = await pollPreviewReady('https://example.railway.app', {
    fetchImpl,
    sleepImpl: async () => {},
  });

  assert.equal(ready, true);
  assert.equal(calls, 2);
});

test('pollPreviewReady: gives up and returns false once the timeout elapses', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return { status: 503 } as Response;
  }) as unknown as typeof fetch;

  const ready = await pollPreviewReady('https://example.railway.app', {
    intervalMs: 1000,
    timeoutMs: 3000,
    fetchImpl,
    sleepImpl: async () => {},
  });

  assert.equal(ready, false);
  assert.equal(calls, 3); // ceil(3000ms / 1000ms) = 3 attempts, no sleep after the last
});
