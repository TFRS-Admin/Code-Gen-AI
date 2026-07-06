import { Router, Request, Response, NextFunction } from 'express';
import * as orchestrator from '../services/orchestrator';
import { listQaRuns } from '../services/verification/verify';

export interface JobsRouterDeps {
  getJob: typeof orchestrator.getJob;
  listJobs: typeof orchestrator.listJobs;
  approveJob: typeof orchestrator.approveJob;
  listQaRuns: typeof listQaRuns;
}

const defaultDeps: JobsRouterDeps = {
  getJob: orchestrator.getJob,
  listJobs: orchestrator.listJobs,
  approveJob: orchestrator.approveJob,
  listQaRuns,
};

export type PreviewStatus = 'building' | 'ready' | 'error';

interface PreviewSourceJob {
  status: string;
  preview_url: string | null;
  updated_at: string | Date;
}

// Statuses in which the pipeline has finished running without ever producing
// a preview_url (M2 preview provisioning is still a TODO in the orchestrator,
// so this is currently the common case once a job reaches these statuses).
const FINISHED_WITHOUT_PREVIEW = new Set(['failed', 'cancelled', 'pr_opened', 'shipped']);

/** Derives the preview panel's status from a job row — never trusts a stale preview_url once the job has failed. */
export function derivePreviewStatus(job: PreviewSourceJob): PreviewStatus {
  if (job.preview_url) return 'ready';
  if (FINISHED_WITHOUT_PREVIEW.has(job.status)) return 'error';
  return 'building';
}

/**
 * Builds the /api/jobs router. Takes the orchestrator functions as an
 * injectable dependency (defaulting to the real service) so tests can stub
 * getJob/listJobs/approveJob without hitting the database — mirrors the
 * createGithubRouter(deps) pattern in ./github.ts.
 */
export function createJobsRouter(deps: JobsRouterDeps = defaultDeps): Router {
  const router = Router();

  // GET /api/jobs — List recent jobs
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const jobs = await deps.listJobs(20);
      res.json({ ok: true, data: jobs });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/jobs/:id — Get a single job by ID
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await deps.getJob(req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
      res.json({ ok: true, data: job });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/jobs/:id/preview — Live preview status for the Dashboard's preview panel
  router.get('/:id/preview', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await deps.getJob(req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });

      const status = derivePreviewStatus(job);
      res.json({
        ok: true,
        data: {
          previewUrl: status === 'ready' ? job.preview_url : null,
          status,
          lastUpdated: job.updated_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/jobs/:id/qa — real QA run history for a job (M4 slice 2), most recent first
  router.get('/:id/qa', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await deps.getJob(req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });

      const qaRuns = await deps.listQaRuns(job.id);
      res.json({ ok: true, data: qaRuns });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/jobs/:id/approve — ships a job in 'review' status by opening its Pull Request
  router.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await deps.getJob(req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
      if (job.status !== 'review') {
        return res.status(409).json({
          ok: false,
          error: { code: 'INVALID_STATUS', message: `Job must be in 'review' status to approve (current: ${job.status})` },
        });
      }
      const result = await deps.approveJob(job.id);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createJobsRouter();
