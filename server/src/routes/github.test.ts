import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createGithubRouter, GithubRouterDeps } from './github';

const unusedService: GithubRouterDeps = {
  listRepos: async () => {
    throw new Error('listRepos should not be called in this test');
  },
  listBranches: async () => {
    throw new Error('listBranches should not be called in this test');
  },
};

/** Starts an ephemeral-port Express app mounting the github router (mirrors real mounting at /api/github), runs fn, then tears it down. */
async function withServer<T>(deps: GithubRouterDeps, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use('/api/github', createGithubRouter(deps));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}/api/github`);
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

test('GET /api/github/health: returns ok:true, hasToken:true and the exact token length when GITHUB_TOKEN is set', async () => {
  const token = 'ghp_' + 'a'.repeat(36);
  await withGithubToken(token, () =>
    withServer(unusedService, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 200);
      assert.deepEqual(body, { ok: true, hasToken: true, tokenLength: token.length });
    })
  );
});

test('GET /api/github/health: returns 503 with a clear NO_TOKEN error when GITHUB_TOKEN is missing', async () => {
  await withGithubToken(undefined, () =>
    withServer(unusedService, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.hasToken, false);
      assert.equal(body.tokenLength, 0);
      assert.equal(body.error.code, 'NO_TOKEN');
      assert.ok(body.error.message.length > 0);
    })
  );
});

test('GET /api/github/repos: still returns the repo list from the github service when GITHUB_TOKEN is set', async () => {
  const fixture = [{ full_name: 'acme/widgets', name: 'widgets', private: false, default_branch: 'main' }];
  const deps: GithubRouterDeps = { ...unusedService, listRepos: async () => fixture };

  await withGithubToken('ghp_' + 'b'.repeat(36), () =>
    withServer(deps, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/repos`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 200);
      assert.deepEqual(body, { ok: true, data: fixture });
    })
  );
});

test('GET /api/github/repos: returns 503 with a clear NO_TOKEN error when GITHUB_TOKEN is missing', async () => {
  await withGithubToken(undefined, () =>
    withServer(unusedService, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/repos`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'NO_TOKEN');
    })
  );
});

test('GET /api/github/repos/:owner/:repo/branches: still returns the branch list from the github service when GITHUB_TOKEN is set', async () => {
  const fixture = [{ name: 'main' }, { name: 'dev' }];
  const deps: GithubRouterDeps = { ...unusedService, listBranches: async () => fixture };

  await withGithubToken('ghp_' + 'c'.repeat(36), () =>
    withServer(deps, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/repos/acme/gizmos/branches`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 200);
      assert.deepEqual(body, { ok: true, data: fixture });
    })
  );
});

test('GET /api/github/repos/:owner/:repo/branches: returns 503 with a clear NO_TOKEN error when GITHUB_TOKEN is missing', async () => {
  await withGithubToken(undefined, () =>
    withServer(unusedService, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/repos/acme/gizmos/branches`);
      const body = (await res.json()) as any;
      assert.equal(res.status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'NO_TOKEN');
    })
  );
});
