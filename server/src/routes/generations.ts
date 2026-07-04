import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createJob } from '../services/orchestrator';
import { getProvider } from '../services/providers';
import { BLAIR_SYSTEM_PROMPT } from '../services/blairPrompt';

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

const ChatSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional()
    .default([]),
  provider: z.enum(['mock', 'openai', 'anthropic']).optional(),
});

// POST /api/generations/chat — Synchronous consultation reply (no job created).
// This backs the Assistant page's pre-lifecycle conversation, per the Consultation
// Phase in prompts/blair-system-prompt.md — distinct from the async job pipeline above.
router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = ChatSchema.parse(req.body);
    const provider = getProvider(input.provider);
    const messages = [
      ...input.history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: input.prompt },
    ];
    const response = await provider.complete(messages, BLAIR_SYSTEM_PROMPT);
    res.json({ ok: true, data: { content: response.content } });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: err.errors } });
    }
    next(err);
  }
});

export default router;
