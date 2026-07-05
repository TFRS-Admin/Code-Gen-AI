import { Router, Request, Response, NextFunction } from 'express';
import * as registryStore from '../services/harvester/store';

export interface RegistryRouterDeps {
  listRegistryComponents: typeof registryStore.listRegistryComponents;
  searchRegistryComponents: typeof registryStore.searchRegistryComponents;
  syncRegistry: typeof registryStore.syncRegistry;
}

function parseSource(value: unknown): 'internal' | 'shadcn' | undefined {
  return value === 'internal' || value === 'shadcn' ? value : undefined;
}

/**
 * Builds the /api/registry router. Takes the harvester store functions as an
 * injectable dependency (defaulting to the real service), mirroring the
 * createJobsRouter(deps)/createReposRouter(deps) DI pattern so tests can stub
 * the database layer.
 */
export function createRegistryRouter(deps: RegistryRouterDeps = registryStore): Router {
  const router = Router();

  // GET /api/registry/components?source=internal|shadcn&q=search — list or search the stored catalog
  router.get('/components', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const components = q
        ? await deps.searchRegistryComponents(q)
        : await deps.listRegistryComponents(parseSource(req.query.source));
      res.json({ ok: true, data: components });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/registry/sync — runs every adapter's discovery and upserts results into the registry
  router.post('/sync', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await deps.syncRegistry();
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createRegistryRouter();
