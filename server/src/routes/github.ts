import { Router, Request, Response, NextFunction } from 'express';
import * as githubService from '../services/github';
import { checkGithubToken } from '../config';

const REPOS_CACHE_TTL_MS = 60_000;
const BRANCHES_CACHE_TTL_MS = 30_000;

export interface GithubRouterDeps {
  listRepos: typeof githubService.listRepos;
  listBranches: typeof githubService.listBranches;
}

/**
 * Builds the /api/github router. Takes the github service functions as an
 * injectable dependency (defaulting to the real service) so tests can stub
 * listRepos/listBranches without making real GitHub API calls — the route
 * structure and behavior are unchanged from the previous module-level router.
 */
export function createGithubRouter(deps: GithubRouterDeps = githubService): Router {
  const router = Router();

  let reposCache: { data: unknown[]; expiresAt: number } | null = null;
  const branchesCache: Record<string, { data: unknown[]; expiresAt: number }> = {};

  /** Short-circuits with a 503 NO_TOKEN response if GITHUB_TOKEN isn't configured. */
  function requireToken(res: Response): boolean {
    const status = checkGithubToken();
    if (!status.hasToken) {
      res.status(503).json({ ok: false, error: { code: 'NO_TOKEN', message: status.message } });
      return false;
    }
    return true;
  }

  // GET /api/github/health — diagnostic endpoint to verify GITHUB_TOKEN is loaded (no GitHub API call is made)
  router.get('/health', (_req: Request, res: Response) => {
    const status = checkGithubToken();
    if (!status.hasToken) {
      return res.status(503).json({
        ok: false,
        hasToken: false,
        tokenLength: status.tokenLength,
        error: { code: 'NO_TOKEN', message: status.message },
      });
    }
    res.json({ ok: true, hasToken: true, tokenLength: status.tokenLength });
  });

  // GET /api/github/repos — lists all repos accessible to GITHUB_TOKEN, cached for 60s
  router.get('/repos', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireToken(res)) return;

      const now = Date.now();
      if (reposCache && reposCache.expiresAt > now) {
        return res.json({ ok: true, data: reposCache.data });
      }

      const data = await deps.listRepos();
      reposCache = { data, expiresAt: now + REPOS_CACHE_TTL_MS };
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/github/repos/:owner/:repo/branches — lists branches for a repo, cached for 30s per repo
  router.get('/repos/:owner/:repo/branches', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireToken(res)) return;

      const { owner, repo } = req.params;
      const key = `${owner}/${repo}`;
      const now = Date.now();
      const cached = branchesCache[key];
      if (cached && cached.expiresAt > now) {
        return res.json({ ok: true, data: cached.data });
      }

      const data = await deps.listBranches(owner, repo);
      branchesCache[key] = { data, expiresAt: now + BRANCHES_CACHE_TTL_MS };
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createGithubRouter();
