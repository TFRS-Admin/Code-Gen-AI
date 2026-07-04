import { Router } from 'express';
import { config } from '../config';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    provider: config.providers.default,
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

export default router;
