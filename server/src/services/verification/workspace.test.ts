import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { materializeWorkspace } from './workspace';
import type { RepoFilesResult } from '../github';

function fakeResult(files: RepoFilesResult['files'], truncated = false): RepoFilesResult {
  return {
    files,
    totalTreeEntries: Object.keys(files).length,
    includedFiles: Object.keys(files).length,
    truncated,
  };
}

/** Runs fn with a scratch root dir (standing in for os.tmpdir()) that's removed afterward regardless of outcome. */
async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'blair-verify-test-root-'));
  try {
    return await fn(root);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test('materializeWorkspace: writes fetched files to disk, preserving nested directories', async () => {
  await withTempRoot(async (root) => {
    const fetchRepoFiles = async () =>
      fakeResult({
        'package.json': { content: '{"name":"demo"}', language: 'json' },
        'src/pages/Example.jsx': { content: 'export default function Example() {}', language: 'javascript' },
      });

    const workspace = await materializeWorkspace(
      { owner: 'acme', repo: 'demo', branch: 'feature/x' },
      { fetchRepoFiles, tmpRootDir: root }
    );

    try {
      assert.equal(workspace.fileCount, 2);
      assert.equal(workspace.truncated, false);
      assert.equal(await fsp.readFile(path.join(workspace.dir, 'package.json'), 'utf8'), '{"name":"demo"}');
      assert.equal(
        await fsp.readFile(path.join(workspace.dir, 'src/pages/Example.jsx'), 'utf8'),
        'export default function Example() {}'
      );
    } finally {
      await workspace.cleanup();
    }
  });
});

test('materializeWorkspace: cleanup removes the temp directory', async () => {
  await withTempRoot(async (root) => {
    const fetchRepoFiles = async () => fakeResult({ 'a.txt': { content: 'x', language: 'plaintext' } });
    const workspace = await materializeWorkspace(
      { owner: 'a', repo: 'b', branch: 'main' },
      { fetchRepoFiles, tmpRootDir: root }
    );

    await workspace.cleanup();

    await assert.rejects(() => fsp.stat(workspace.dir), /ENOENT/);
  });
});

test('materializeWorkspace: propagates a fetch failure without creating a temp directory', async () => {
  await withTempRoot(async (root) => {
    const fetchRepoFiles = async () => {
      throw new Error('GitHub API error during getRepoFiles: rate limited');
    };

    await assert.rejects(
      () => materializeWorkspace({ owner: 'a', repo: 'b', branch: 'main' }, { fetchRepoFiles, tmpRootDir: root }),
      /rate limited/
    );

    assert.deepEqual(await fsp.readdir(root), []);
  });
});

test('materializeWorkspace: refuses to write a file path that escapes the workspace directory', async () => {
  await withTempRoot(async (root) => {
    const fetchRepoFiles = async () => fakeResult({ '../escape.txt': { content: 'evil', language: 'plaintext' } });

    await assert.rejects(
      () => materializeWorkspace({ owner: 'a', repo: 'b', branch: 'main' }, { fetchRepoFiles, tmpRootDir: root }),
      /Refusing to write outside the workspace directory/
    );
  });
});

test('materializeWorkspace: cleans up the temp directory if a write fails partway through', async () => {
  await withTempRoot(async (root) => {
    const fetchRepoFiles = async () =>
      fakeResult({
        'ok.txt': { content: 'fine', language: 'plaintext' },
        '../escape.txt': { content: 'evil', language: 'plaintext' },
      });

    await assert.rejects(() =>
      materializeWorkspace({ owner: 'a', repo: 'b', branch: 'main' }, { fetchRepoFiles, tmpRootDir: root })
    );

    assert.deepEqual(await fsp.readdir(root), []);
  });
});
