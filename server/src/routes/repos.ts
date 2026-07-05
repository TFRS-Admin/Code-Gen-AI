import { Router, Request, Response, NextFunction } from 'express';
import * as githubService from '../services/github';
import { checkGithubToken } from '../config';

const FILES_CACHE_TTL_MS = 5 * 60_000;

export interface ReposRouterDeps {
  getRepoFiles: typeof githubService.getRepoFiles;
}

/**
 * Builds the /api/repos router. Takes the github service's getRepoFiles as
 * an injectable dependency (defaulting to the real service), matching the
 * DI pattern used by the /api/github router so tests can stub it without
 * making real GitHub API calls.
 */
export function createReposRouter(deps: ReposRouterDeps = githubService): Router {
  const router = Router();

  const filesCache: Record<string, { data: unknown; expiresAt: number }> = {};

  /** Short-circuits with a 503 NO_TOKEN response if GITHUB_TOKEN isn't configured. */
  function requireToken(res: Response): boolean {
    const status = checkGithubToken();
    if (!status.hasToken) {
      res.status(503).json({ ok: false, error: { code: 'NO_TOKEN', message: status.message } });
      return false;
    }
    return true;
  }

  // GET /api/repos/:owner/:repo/files?branch=main — full repo file tree +
  // contents for booting a WebContainers instant preview, cached for 5
  // minutes per owner/repo/branch.
  router.get('/:owner/:repo/files', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireToken(res)) return;

      const { owner, repo } = req.params;
      const branchParam = req.query.branch;
      const branch = typeof branchParam === 'string' ? branchParam.trim() : '';
      if (!branch) {
        return res
          .status(400)
          .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'branch query parameter is required' } });
      }

      const key = `${owner}/${repo}#${branch}`;
      const now = Date.now();
      const cached = filesCache[key];
      if (cached && cached.expiresAt > now) {
        return res.json({ ok: true, data: cached.data });
      }

      const data = await deps.getRepoFiles(owner, repo, branch);
      filesCache[key] = { data, expiresAt: now + FILES_CACHE_TTL_MS };
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createReposRouter();
