import { Router, Request, Response, NextFunction } from 'express';
import { getJob, listJobs } from '../services/orchestrator';

const router = Router();

// GET /api/jobs — List recent jobs
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await listJobs(20);
    res.json({ ok: true, data: jobs });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id — Get a single job by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    res.json({ ok: true, data: job });
  } catch (err) {
    next(err);
  }
});

export default router;
