import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as github from '../github';
import type { RepoFilesResult } from '../github';

/**
 * The server has no persistent filesystem or local git (server/src/services/
 * github/index.ts:1-7) — all repo access goes through the GitHub REST API.
 * This reconstructs a job's branch as a real working directory by reusing
 * the existing getRepoFiles fetcher (already used for the WebContainers
 * preview route) rather than shelling out to `git clone`, so verification
 * commands (npm install/lint/etc., docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md)
 * have something real on disk to run against.
 */
export type WorkspaceFilesFetcher = (owner: string, repo: string, branch: string) => Promise<RepoFilesResult>;

export interface Workspace {
  dir: string;
  fileCount: number;
  truncated: boolean;
  cleanup: () => Promise<void>;
}

export interface MaterializeWorkspaceInput {
  owner: string;
  repo: string;
  branch: string;
}

export interface MaterializeWorkspaceOptions {
  fetchRepoFiles?: WorkspaceFilesFetcher;
  /** Injectable for tests; defaults to the OS temp directory. */
  tmpRootDir?: string;
}

const WORKSPACE_DIR_PREFIX = 'blair-verify-';

/**
 * Fetches a branch's files and writes them into a fresh temp directory.
 * Throws (does not swallow) if the fetch itself fails — callers decide how
 * to classify a materialization failure (verify.ts treats it as an
 * "errored" check, not a "failed" one, since it isn't evidence of a problem
 * in the generated code).
 */
export async function materializeWorkspace(
  input: MaterializeWorkspaceInput,
  opts: MaterializeWorkspaceOptions = {}
): Promise<Workspace> {
  const fetchRepoFiles = opts.fetchRepoFiles ?? github.getRepoFiles;
  const tmpRoot = opts.tmpRootDir ?? os.tmpdir();

  const { files, truncated } = await fetchRepoFiles(input.owner, input.repo, input.branch);

  const dir = await fsp.mkdtemp(path.join(tmpRoot, WORKSPACE_DIR_PREFIX));

  let fileCount = 0;
  try {
    for (const [relativePath, entry] of Object.entries(files)) {
      const destPath = resolveWithinWorkspace(dir, relativePath);
      await fsp.mkdir(path.dirname(destPath), { recursive: true });
      await fsp.writeFile(destPath, entry.content, 'utf8');
      fileCount++;
    }
  } catch (err) {
    // Don't leave a half-written temp directory behind if writing fails partway through.
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  return {
    dir,
    fileCount,
    truncated,
    cleanup: () => fsp.rm(dir, { recursive: true, force: true }),
  };
}

/**
 * Resolves a repo-relative path within the workspace directory, refusing
 * anything that would escape it (e.g. a path containing "../"). Repo file
 * paths come from the GitHub API for whatever arbitrary repo the user
 * connected, so this is defense in depth rather than a response to a known
 * exploit in getRepoFiles today.
 */
function resolveWithinWorkspace(workspaceDir: string, relativePath: string): string {
  const resolved = path.resolve(workspaceDir, relativePath);
  if (resolved !== workspaceDir && !resolved.startsWith(workspaceDir + path.sep)) {
    throw new Error(`Refusing to write outside the workspace directory: ${relativePath}`);
  }
  return resolved;
}
