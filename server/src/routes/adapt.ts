import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adaptComponentCode, extractTFRSClasses } from '../services/harvester/tfrs-adapter';
import * as registryStore from '../services/harvester/store';
import type { RegistryComponentRow } from '../services/harvester/store';

export interface AdaptRouterDeps {
  getRegistryComponentById: typeof registryStore.getRegistryComponentById;
}

const AdaptComponentSchema = z.object({
  componentCode: z.string().min(1, 'componentCode is required'),
  componentId: z.string().optional(),
});

const AdaptBatchSchema = z.object({
  components: z
    .array(
      z.object({
        id: z.string().optional(),
        code: z.string().min(1, 'code is required'),
      })
    )
    .min(1, 'components must contain at least one entry'),
});

/**
 * Builds the /api/adapt router. Takes the registry store's search function as
 * an injectable dependency (defaulting to the real service), mirroring the
 * createRegistryRouter(deps) DI pattern so tests can stub the database layer.
 */
export function createAdaptRouter(deps: AdaptRouterDeps = registryStore): Router {
  const router = Router();

  // POST /api/adapt/component — adapt a single component's code to TFRS design tokens
  router.post('/component', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { componentCode, componentId } = AdaptComponentSchema.parse(req.body);

      const adaptedCode = adaptComponentCode(componentCode);
      const tfrsClasses = extractTFRSClasses(adaptedCode);

      const componentMetadata: RegistryComponentRow | null = componentId
        ? await deps.getRegistryComponentById(componentId)
        : null;

      res.json({ ok: true, data: { adaptedCode, tfrsClasses, componentMetadata } });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: err.errors } });
      }
      next(err);
    }
  });

  // POST /api/adapt/batch — adapt multiple components' code in one call
  router.post('/batch', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { components } = AdaptBatchSchema.parse(req.body);

      const results = components.map((comp) => {
        const adaptedCode = adaptComponentCode(comp.code);
        const tfrsClasses = extractTFRSClasses(adaptedCode);
        return { id: comp.id, adaptedCode, tfrsClasses };
      });

      res.json({ ok: true, data: results });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: err.errors } });
      }
      next(err);
    }
  });

  return router;
}

export default createAdaptRouter();
