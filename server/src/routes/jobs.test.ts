import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createJobsRouter, JobsRouterDeps } from './jobs';
import { errorHandler } from '../middleware';

const unusedDeps: JobsRouterDeps = {
  getJob: async () => {
    throw new Error('getJob should not be called in this test');
  },
  listJobs: async () => {
    throw new Error('listJobs should not be called in this test');
  },
  approveJob: async () => {
    throw new Error('approveJob should not be called in this test');
  },
  listQaRuns: async () => {
    throw new Error('listQaRuns should not be called in this test');
  },
};

/** Starts an ephemeral-port Express app mounting the jobs router (mirrors real mounting at /api/jobs), runs fn, then tears it down. */
async function withServer<T>(deps: JobsRouterDeps, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use('/api/jobs', createJobsRouter(deps));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}/api/jobs`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function baseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    status: 'building',
    preview_url: null,
    updated_at: '2026-07-05T10:00:00.000Z',
    ...overrides,
  };
}

test('GET /api/jobs/:id/preview: returns 404 NOT_FOUND when the job does not exist', async () => {
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => null };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/missing/preview`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});

test('GET /api/jobs/:id/preview: reports status "building" with a null previewUrl while the pipeline is still running', async () => {
  const job = baseJob({ status: 'qa' });
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => job };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/job-1/preview`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, {
      ok: true,
      data: { previewUrl: null, status: 'building', lastUpdated: job.updated_at },
    });
  });
});

test('GET /api/jobs/:id/preview: reports status "ready" with the previewUrl once one has been set', async () => {
  const job = baseJob({ status: 'review', preview_url: 'https://preview.example.com/job-1' });
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => job };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/job-1/preview`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, {
      ok: true,
      data: { previewUrl: job.preview_url, status: 'ready', lastUpdated: job.updated_at },
    });
  });
});

test('GET /api/jobs/:id/preview: reports status "error" when the job failed', async () => {
  const job = baseJob({ status: 'failed' });
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => job };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/job-1/preview`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body.data, { previewUrl: null, status: 'error', lastUpdated: job.updated_at });
  });
});

test('GET /api/jobs/:id/preview: reports status "error" when the job shipped without ever producing a preview', async () => {
  const job = baseJob({ status: 'shipped' });
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => job };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/job-1/preview`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body.data, { previewUrl: null, status: 'error', lastUpdated: job.updated_at });
  });
});

test('GET /api/jobs/:id: still returns the job from the orchestrator when found', async () => {
  const job = baseJob();
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => job };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/job-1`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, data: job });
  });
});

test('GET /api/jobs/:id: returns 404 NOT_FOUND when the job does not exist', async () => {
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => null };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/missing`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});

test('GET /api/jobs: returns 200 with an empty array when no jobs exist', async () => {
  const deps: JobsRouterDeps = { ...unusedDeps, listJobs: async () => [] };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, data: [] });
  });
});

test('GET /api/jobs: returns 200 with the job list when jobs exist', async () => {
  const jobs = [baseJob({ id: 'job-1' }), baseJob({ id: 'job-2' })];
  const deps: JobsRouterDeps = { ...unusedDeps, listJobs: async () => jobs };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, data: jobs });
  });
});

test('GET /api/jobs: returns a generic 500 without leaking internal error details when the DB query fails', async () => {
  const deps: JobsRouterDeps = {
    ...unusedDeps,
    listJobs: async () => {
      const dbErr: any = new Error('relation "jobs" does not exist');
      dbErr.code = '42P01';
      throw dbErr;
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(baseUrl);
    const body = (await res.json()) as any;
    assert.equal(res.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'An unexpected error occurred');
  });
});

test('GET /api/jobs/:id/qa: returns 404 NOT_FOUND when the job does not exist', async () => {
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => null };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/missing/qa`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});

test('GET /api/jobs/:id/qa: returns an empty array when no qa_runs rows exist yet', async () => {
  const job = baseJob();
  const deps: JobsRouterDeps = { ...unusedDeps, getJob: async () => job, listQaRuns: async () => [] };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/job-1/qa`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, data: [] });
  });
});

test('GET /api/jobs/:id/qa: returns the persisted qa_runs rows, most recent first', async () => {
  const job = baseJob();
  const qaRuns = [
    {
      id: 'qa-2',
      job_id: 'job-1',
      lint_passed: false,
      build_passed: null,
      typecheck_passed: null,
      tests_passed: null,
      lint_output: '1 problem',
      build_output: null,
      typecheck_output: null,
      test_output: null,
      created_at: '2026-07-06T00:01:00.000Z',
    },
    {
      id: 'qa-1',
      job_id: 'job-1',
      lint_passed: true,
      build_passed: null,
      typecheck_passed: null,
      tests_passed: null,
      lint_output: '',
      build_output: null,
      typecheck_output: null,
      test_output: null,
      created_at: '2026-07-06T00:00:00.000Z',
    },
  ];
  let calledWith: unknown;
  const deps: JobsRouterDeps = {
    ...unusedDeps,
    getJob: async () => job,
    listQaRuns: async (jobId) => {
      calledWith = jobId;
      return qaRuns;
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/job-1/qa`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, data: qaRuns });
    assert.equal(calledWith, 'job-1');
  });
});

test('GET /api/jobs/:id/qa: returns a generic 500 without leaking internal error details when the DB query fails', async () => {
  const deps: JobsRouterDeps = {
    ...unusedDeps,
    getJob: async () => baseJob(),
    listQaRuns: async () => {
      const dbErr: any = new Error('relation "qa_runs" does not exist');
      dbErr.code = '42P01';
      throw dbErr;
    },
  };
  await withServer(deps, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/job-1/qa`);
    const body = (await res.json()) as any;
    assert.equal(res.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
  });
});
