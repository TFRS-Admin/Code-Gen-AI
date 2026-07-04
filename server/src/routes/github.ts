import { Router, Request, Response, NextFunction } from 'express';
import { listRepos, listBranches } from '../services/github';

const router = Router();

const REPOS_CACHE_TTL_MS = 60_000;
const BRANCHES_CACHE_TTL_MS = 30_000;

let reposCache: { data: unknown[]; expiresAt: number } | null = null;
const branchesCache: Record<string, { data: unknown[]; expiresAt: number }> = {};

/** Short-circuits with a 503 NO_TOKEN response if GITHUB_TOKEN isn't configured. */
function requireToken(res: Response): boolean {
  if (!process.env.GITHUB_TOKEN) {
    res.status(503).json({ ok: false, error: { code: 'NO_TOKEN', message: 'GITHUB_TOKEN not configured' } });
    return false;
  }
  return true;
}

// GET /api/github/repos — lists all repos accessible to GITHUB_TOKEN, cached for 60s
router.get('/repos', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireToken(res)) return;

    const now = Date.now();
    if (reposCache && reposCache.expiresAt > now) {
      return res.json({ ok: true, data: reposCache.data });
    }

    const data = await listRepos();
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

    const data = await listBranches(owner, repo);
    branchesCache[key] = { data, expiresAt: now + BRANCHES_CACHE_TTL_MS };
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
