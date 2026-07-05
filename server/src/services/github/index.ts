/**
 * GitHub service — thin wrapper around the GitHub REST API (via Octokit).
 *
 * The server runs on Railway with no persistent filesystem, so all repository
 * operations (reading files, creating branches, committing, opening PRs) go
 * through the GitHub REST API rather than local git commands.
 */

import { Octokit } from '@octokit/rest';
import { checkGithubToken } from '../../config';

let octokitClient: any = null;
let cachedTokenSignature: string | null = null;

/** Cheap, non-cryptographic fingerprint used only to detect that GITHUB_TOKEN changed — never logged or exposed. */
function tokenSignature(token: string): string {
  return `${token.length}:${token.slice(0, 4)}:${token.slice(-4)}`;
}

/**
 * Lazily constructs the Octokit client, authenticated with GITHUB_TOKEN.
 *
 * The token is validated on every call rather than trusting an indefinitely
 * cached client: if GITHUB_TOKEN is missing we fail with a clear error every
 * time (not just on first boot), and if the token value changes (e.g. a
 * Railway var rotation without a full process restart) the cached client is
 * rebuilt instead of silently continuing to auth with the stale value.
 */
async function getClient(): Promise<any> {
  const status = checkGithubToken();
  if (!status.hasToken) {
    throw new Error(`GITHUB_TOKEN is not set in the environment: ${status.message}`);
  }

  const token = process.env.GITHUB_TOKEN as string;
  const signature = tokenSignature(token);

  if (octokitClient && cachedTokenSignature === signature) {
    return octokitClient;
  }

  octokitClient = new Octokit({ auth: token });
  cachedTokenSignature = signature;
  return octokitClient;
}

/** Wraps a GitHub API error with a descriptive message that includes the API's own error response. */
function wrapError(action: string, err: any): Error {
  const status = err?.status ? ` (status ${err.status})` : '';
  const apiMessage = err?.response?.data?.message || err?.message || 'Unknown error';
  return new Error(`GitHub API error during ${action}${status}: ${apiMessage}`);
}

/** Parses a GitHub repo URL (https or git@ form, with or without .git suffix) into { owner, repo }. */
export function parseRepoUrl(url: string): { owner: string; repo: string } {
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!httpsMatch) {
    throw new Error(`parseRepoUrl: could not parse GitHub owner/repo from URL: ${url}`);
  }
  return { owner: httpsMatch[1], repo: httpsMatch[2] };
}

/** Gets the current commit SHA that a branch points to. */
export async function getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
  try {
    const octokit = await getClient();
    const res = await octokit.rest.repos.getBranch({ owner, repo, branch });
    return res.data.commit.sha;
  } catch (err: any) {
    throw wrapError(`getBranchSha(${owner}/${repo}#${branch})`, err);
  }
}

/** Lists the contents of a single directory path on a branch (empty string = repo root). */
async function listDirectory(octokit: any, owner: string, repo: string, path: string, branch: string): Promise<any[]> {
  const res = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch });
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * Gets the file tree of a branch, limited to the top 2 directory levels, to
 * avoid overflowing the LLM context on large repos.
 */
export async function getFileTree(owner: string, repo: string, branch: string): Promise<string[]> {
  try {
    const octokit = await getClient();
    const paths: string[] = [];
    const level1 = await listDirectory(octokit, owner, repo, '', branch);

    for (const entry of level1) {
      paths.push(entry.path);
      if (entry.type === 'dir') {
        try {
          const level2 = await listDirectory(octokit, owner, repo, entry.path, branch);
          for (const sub of level2) paths.push(sub.path);
        } catch {
          // Skip directories we can't list (e.g. submodules) rather than failing the whole tree fetch.
        }
      }
    }

    return paths;
  } catch (err: any) {
    throw wrapError(`getFileTree(${owner}/${repo}#${branch})`, err);
  }
}

/** Gets the content of a specific file on a branch. Returns an empty string if the file doesn't exist. */
export async function getFileContent(owner: string, repo: string, branch: string, path: string): Promise<string> {
  try {
    const octokit = await getClient();
    const res = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch });
    if (Array.isArray(res.data) || res.data.type !== 'file' || !res.data.content) return '';
    return Buffer.from(res.data.content, 'base64').toString('utf8');
  } catch (err: any) {
    if (err.status === 404) return '';
    throw wrapError(`getFileContent(${owner}/${repo}#${branch}:${path})`, err);
  }
}

// ─── Full file tree + contents (for WebContainers) ──────────────────────

// Directories that never help boot a WebContainers dev server and can be
// large (dependencies, build output, VCS/editor metadata).
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules', '.git', '.github', '.vscode', '.idea',
  'dist', 'build', '.next', '.nuxt', 'coverage', '.cache', 'out',
  'vendor', '.turbo', '.vercel', '.netlify', '.parcel-cache', '.svelte-kit',
]);

// Filenames that commonly carry secrets/tokens — never sent to the browser,
// mirroring the "never mount .env values" preview sandbox rule.
const EXCLUDED_FILE_NAMES = new Set(['.npmrc', '.yarnrc', '.yarnrc.yml', '.netrc', '.git-credentials']);

// Binary formats can't be represented as UTF-8 text content, so they're
// excluded rather than corrupted; WebContainers can still boot a dev server
// without them for the purposes of an instant preview.
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'bmp', 'avif',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pdf', 'zip', 'tar', 'gz', 'tgz', '7z', 'rar',
  'mp4', 'mp3', 'wav', 'mov', 'avi', 'webm', 'ogg', 'flac',
  'exe', 'dll', 'so', 'dylib', 'bin', 'wasm', 'jar', 'class',
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html',
  md: 'markdown', mdx: 'markdown',
  yml: 'yaml', yaml: 'yaml',
  sh: 'shell', bash: 'shell',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  php: 'php', sql: 'sql', graphql: 'graphql', gql: 'graphql',
  vue: 'vue', svelte: 'svelte', xml: 'xml', svg: 'xml',
  toml: 'toml', txt: 'plaintext',
};

// Bounds GitHub API usage (one Git Blob request per included file) and the
// size of the response sent to the browser.
const MAX_FILES = 400;
const MAX_FILE_BYTES = 300 * 1024;
const BLOB_FETCH_CONCURRENCY = 8;

function fileExtension(path: string): string {
  const basename = path.split('/').pop() || '';
  const dotIndex = basename.lastIndexOf('.');
  return dotIndex > 0 ? basename.slice(dotIndex + 1).toLowerCase() : '';
}

function isExcludedPath(path: string): boolean {
  const segments = path.split('/');
  const basename = segments[segments.length - 1];
  if (segments.slice(0, -1).some((segment) => EXCLUDED_DIR_NAMES.has(segment))) return true;
  if (EXCLUDED_FILE_NAMES.has(basename)) return true;
  if (basename === '.env' || basename.startsWith('.env.')) return true;
  return false;
}

function detectLanguage(path: string): string {
  return LANGUAGE_BY_EXTENSION[fileExtension(path)] || 'plaintext';
}

export interface RepoFileEntry {
  content: string;
  language: string;
}

export interface RepoFilesResult {
  files: Record<string, RepoFileEntry>;
  totalTreeEntries: number;
  includedFiles: number;
  truncated: boolean;
}

/**
 * Fetches the full text-file tree + contents of a branch, for mounting into
 * a WebContainers instance. Uses the Git Trees API (recursive) to list every
 * blob in one call, then fetches blob content in small concurrent batches —
 * far fewer round trips than walking directories with `repos.getContent`.
 *
 * Excludes dependency/build/VCS directories, secret-bearing dotfiles, and
 * binary files (which can't be represented as UTF-8 text), and caps the
 * number and size of files fetched to bound GitHub API usage.
 */
export async function getRepoFiles(owner: string, repo: string, branch: string): Promise<RepoFilesResult> {
  try {
    const octokit = await getClient();
    const branchSha = await getBranchSha(owner, repo, branch);
    const treeRes = await octokit.rest.git.getTree({ owner, repo, tree_sha: branchSha, recursive: '1' });

    const allBlobs: any[] = (treeRes.data.tree || []).filter((entry: any) => entry.type === 'blob');
    const candidates = allBlobs.filter(
      (entry: any) => !isExcludedPath(entry.path) && !BINARY_EXTENSIONS.has(fileExtension(entry.path))
    );
    const truncated = Boolean(treeRes.data.truncated) || candidates.length > MAX_FILES;
    const selected = candidates.slice(0, MAX_FILES);

    const files: Record<string, RepoFileEntry> = {};
    for (let i = 0; i < selected.length; i += BLOB_FETCH_CONCURRENCY) {
      const batch = selected.slice(i, i + BLOB_FETCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (entry: any) => {
          if (typeof entry.size === 'number' && entry.size > MAX_FILE_BYTES) return null;
          const blob = await octokit.rest.git.getBlob({ owner, repo, file_sha: entry.sha });
          if (blob.data.encoding !== 'base64') return null;
          return { path: entry.path as string, content: Buffer.from(blob.data.content, 'base64').toString('utf8') };
        })
      );
      for (const result of results) {
        if (result) files[result.path] = { content: result.content, language: detectLanguage(result.path) };
      }
    }

    return {
      files,
      totalTreeEntries: allBlobs.length,
      includedFiles: Object.keys(files).length,
      truncated,
    };
  } catch (err: any) {
    throw wrapError(`getRepoFiles(${owner}/${repo}#${branch})`, err);
  }
}

/** Creates a new branch pointing at the given commit SHA. */
export async function createBranch(owner: string, repo: string, branch: string, fromSha: string): Promise<void> {
  try {
    const octokit = await getClient();
    await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: fromSha });
  } catch (err: any) {
    throw wrapError(`createBranch(${owner}/${repo}#${branch})`, err);
  }
}

/** Looks up the blob SHA of an existing file on a branch, or undefined if it doesn't exist. */
async function getExistingFileSha(octokit: any, owner: string, repo: string, branch: string, path: string): Promise<string | undefined> {
  try {
    const res = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch });
    if (!Array.isArray(res.data) && res.data.type === 'file') return res.data.sha;
    return undefined;
  } catch (err: any) {
    if (err.status === 404) return undefined;
    throw err;
  }
}

/** Creates a file if it doesn't exist on the branch, or updates it in place if it does. */
export async function upsertFile(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string
): Promise<void> {
  try {
    const octokit = await getClient();
    const sha = await getExistingFileSha(octokit, owner, repo, branch, path);
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      branch,
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      ...(sha ? { sha } : {}),
    });
  } catch (err: any) {
    throw wrapError(`upsertFile(${owner}/${repo}#${branch}:${path})`, err);
  }
}

/** Deletes a file on a branch. */
export async function deleteFile(owner: string, repo: string, branch: string, path: string, message: string): Promise<void> {
  try {
    const octokit = await getClient();
    const sha = await getExistingFileSha(octokit, owner, repo, branch, path);
    if (!sha) throw new Error(`${path} does not exist on branch ${branch}`);
    await octokit.rest.repos.deleteFile({ owner, repo, path, branch, message, sha });
  } catch (err: any) {
    throw wrapError(`deleteFile(${owner}/${repo}#${branch}:${path})`, err);
  }
}

/** Lists all repositories accessible to the authenticated token, sorted alphabetically by full_name. */
export async function listRepos(): Promise<
  Array<{ full_name: string; name: string; private: boolean; default_branch: string }>
> {
  try {
    const octokit = await getClient();
    const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
      per_page: 100,
      affiliation: 'owner,collaborator,organization_member',
    });
    return repos
      .map((r: any) => ({
        full_name: r.full_name,
        name: r.name,
        private: r.private,
        default_branch: r.default_branch,
      }))
      .sort((a: { full_name: string }, b: { full_name: string }) => a.full_name.localeCompare(b.full_name));
  } catch (err: any) {
    throw wrapError('listRepos()', err);
  }
}

/** Lists all branches for a repo, with the default branch first, then alphabetically. */
export async function listBranches(owner: string, repo: string): Promise<Array<{ name: string }>> {
  try {
    const octokit = await getClient();
    const [branches, repoInfo] = await Promise.all([
      octokit.paginate(octokit.rest.repos.listBranches, { owner, repo, per_page: 100 }),
      octokit.rest.repos.get({ owner, repo }),
    ]);
    const defaultBranch = repoInfo.data.default_branch;
    const names: string[] = branches.map((b: any) => b.name);
    names.sort((a, b) => {
      if (a === defaultBranch) return -1;
      if (b === defaultBranch) return 1;
      return a.localeCompare(b);
    });
    return names.map((name) => ({ name }));
  } catch (err: any) {
    throw wrapError(`listBranches(${owner}/${repo})`, err);
  }
}

/** Creates a Pull Request and returns its HTML URL. */
export async function createPullRequest(
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<string> {
  try {
    const octokit = await getClient();
    const res = await octokit.rest.pulls.create({ owner, repo, head, base, title, body });
    return res.data.html_url;
  } catch (err: any) {
    throw wrapError(`createPullRequest(${owner}/${repo} ${head}->${base})`, err);
  }
}
