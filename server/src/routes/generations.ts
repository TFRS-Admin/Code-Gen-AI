import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createJob } from '../services/orchestrator';

const router = Router();

const CreateJobSchema = z.object({
  repoUrl: z.string().url('repoUrl must be a valid URL'),
  baseBranch: z.string().optional().default('develop'),
  prompt: z.string().min(10, 'prompt must be at least 10 characters'),
  provider: z.enum(['mock', 'openai', 'anthropic']).optional(),
});

// POST /api/generations — Create a new job
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CreateJobSchema.parse(req.body);
    const job = await createJob(input);
    res.status(202).json({ ok: true, data: job });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: err.errors } });
    }
    next(err);
  }
});

export default router;
