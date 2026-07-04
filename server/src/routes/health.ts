import { Router } from 'express';
import { config } from '../config';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'blair-server',
    env: config.nodeEnv,
    provider: config.providers.default,
    timestamp: new Date().toISOString(),
  });
});

export default router;
