import { Router } from 'express';
import { config } from '../config';
import { db } from '../db/client';

const router = Router();

router.get('/', async (_req, res) => {
  let database: 'ok' | 'error' = 'ok';
  try {
    await db.query('SELECT 1');
  } catch (err: any) {
    database = 'error';
    console.error('[health] Database check failed:', err.message);
  }

  res.status(database === 'ok' ? 200 : 503).json({
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    provider: config.providers.default,
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

export default router;
