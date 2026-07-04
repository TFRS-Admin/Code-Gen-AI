import { Router, Request, Response, NextFunction } from 'express';
import { getJob, listJobs, approveJob } from '../services/orchestrator';

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

// POST /api/jobs/:id/approve — ships a job in 'review' status by opening its Pull Request
router.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    if (job.status !== 'review') {
      return res.status(409).json({
        ok: false,
        error: { code: 'INVALID_STATUS', message: `Job must be in 'review' status to approve (current: ${job.status})` },
      });
    }
    const result = await approveJob(job.id);
    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
