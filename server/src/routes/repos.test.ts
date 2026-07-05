import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createReposRouter, ReposRouterDeps } from './repos';

const unusedService: ReposRouterDeps = {
  getRepoFiles: async () => {
    throw new Error('getRepoFiles should not be called in this test');
  },
};

/** Starts an ephemeral-port Express app mounting the repos router (mirrors real mounting at /api/repos), runs fn, then tears it down. */
async function withServer<T>(deps: ReposRouterDeps, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use('/api/repos', createReposRouter(deps));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}/api/repos`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Runs fn with process.env.GITHUB_TOKEN set to value (or deleted, if undefined), then restores the original. */
async function withGithubToken<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const original = process.env.GITHUB_TOKEN;
  if (value === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = value;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = original;
  }
}

test('GET /api/repos/:owner/:repo/files: returns the file map from the github service when GITHUB_TOKEN is set and branch is given', async () => {
  const fixture = {
    files: { 'package.json': { content: '{"name":"widgets"}', language: 'json' } },
    totalTreeEntries: 1,
    includedFiles: 1,
    truncated: false,
  };
  let calledWith: unknown;
  const deps: ReposRouterDeps = {
    getRepoFiles: async (owner, repo, branch) => {
      calledWith = { owner, repo, branch };
      return fixture;
    },
  };

  await withGithubToken('ghp_' + 'a'.repeat(36), () =>
    withServer(deps, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/acme/widgets/files?branch=main`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 200);
      assert.deepEqual(body, { ok: true, data: fixture });
      assert.deepEqual(calledWith, { owner: 'acme', repo: 'widgets', branch: 'main' });
    })
  );
});

test('GET /api/repos/:owner/:repo/files: caches the response for repeated requests within the TTL', async () => {
  let callCount = 0;
  const fixture = { files: {}, totalTreeEntries: 0, includedFiles: 0, truncated: false };
  const deps: ReposRouterDeps = {
    getRepoFiles: async () => {
      callCount += 1;
      return fixture;
    },
  };

  await withGithubToken('ghp_' + 'b'.repeat(36), () =>
    withServer(deps, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/acme/widgets/files?branch=main`);
      const second = await fetch(`${baseUrl}/acme/widgets/files?branch=main`);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(callCount, 1);
    })
  );
});

test('GET /api/repos/:owner/:repo/files: returns 400 VALIDATION_FAILED when branch query param is missing', async () => {
  await withGithubToken('ghp_' + 'c'.repeat(36), () =>
    withServer(unusedService, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/acme/widgets/files`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 400);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'VALIDATION_FAILED');
    })
  );
});

test('GET /api/repos/:owner/:repo/files: returns 503 with a clear NO_TOKEN error when GITHUB_TOKEN is missing', async () => {
  await withGithubToken(undefined, () =>
    withServer(unusedService, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/acme/widgets/files?branch=main`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'NO_TOKEN');
    })
  );
});
