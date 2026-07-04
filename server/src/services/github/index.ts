/**
 * GitHub service — thin wrapper around the GitHub REST API (via Octokit).
 *
 * The server runs on Railway with no persistent filesystem, so all repository
 * operations (reading files, creating branches, committing, opening PRs) go
 * through the GitHub REST API rather than local git commands.
 */

let octokitClient: any = null;

/**
 * Lazily constructs (and caches) the Octokit client, authenticated with
 * GITHUB_TOKEN. @octokit/rest is ESM-only, so it is loaded via dynamic
 * import from this CommonJS module.
 */
async function getClient(): Promise<any> {
  if (octokitClient) return octokitClient;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set in the environment');
  }

  const { Octokit } = await import('@octokit/rest');
  octokitClient = new Octokit({ auth: token });
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
