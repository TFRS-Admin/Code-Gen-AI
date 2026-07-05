import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adaptComponentCode, extractTFRSClasses } from '../services/harvester/tfrs-adapter';
import * as registryStore from '../services/harvester/store';
import type { RegistryComponentRow } from '../services/harvester/store';
import * as manifestStore from '../services/harvester/manifest-store';

export interface AdaptRouterDeps {
  getRegistryComponentById: typeof registryStore.getRegistryComponentById;
  persistManifest: typeof manifestStore.persistManifest;
}

const defaultDeps: AdaptRouterDeps = {
  getRegistryComponentById: registryStore.getRegistryComponentById,
  persistManifest: manifestStore.persistManifest,
};

const AdaptComponentSchema = z.object({
  componentCode: z.string().min(1, 'componentCode is required'),
  componentId: z.string().optional(),
  requirementId: z.string().optional(),
  componentName: z.string().optional(),
  jobId: z.string().optional(),
  planId: z.string().optional(),
});

const AdaptBatchSchema = z.object({
  components: z
    .array(
      z.object({
        id: z.string().optional(),
        code: z.string().min(1, 'code is required'),
        componentId: z.string().optional(),
        componentName: z.string().optional(),
        jobId: z.string().optional(),
        planId: z.string().optional(),
      })
    )
    .min(1, 'components must contain at least one entry'),
});

/**
 * Builds the /api/adapt router. Takes the registry store's search function and
 * the manifest store's persistence function as injectable dependencies
 * (defaulting to the real services), mirroring the createRegistryRouter(deps)
 * DI pattern so tests can stub the database layer.
 */
export function createAdaptRouter(deps: AdaptRouterDeps = defaultDeps): Router {
  const router = Router();

  // POST /api/adapt/component — adapt a single component's code to TFRS design tokens,
  // then build and persist a component manifest (contracts/component-manifest.schema.json)
  router.post('/component', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { componentCode, componentId, requirementId, componentName, jobId, planId } =
        AdaptComponentSchema.parse(req.body);

      const adaptedCode = adaptComponentCode(componentCode);
      const tfrsClasses = extractTFRSClasses(adaptedCode);

      const componentMetadata: RegistryComponentRow | null = componentId
        ? await deps.getRegistryComponentById(componentId)
        : null;

      const manifest = manifestStore.buildManifest({
        requirementId,
        componentName,
        tfrsClasses,
        componentMetadata,
        planId,
      });
      await deps.persistManifest(manifest, { jobId, planId });

      res.json({ ok: true, data: { adaptedCode, tfrsClasses, componentMetadata, manifest } });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: err.errors } });
      }
      next(err);
    }
  });

  // POST /api/adapt/batch — adapt multiple components' code in one call, building and
  // persisting one manifest per adapted component
  router.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { components } = AdaptBatchSchema.parse(req.body);

      const results = await Promise.all(
        components.map(async (comp) => {
          const adaptedCode = adaptComponentCode(comp.code);
          const tfrsClasses = extractTFRSClasses(adaptedCode);

          const componentMetadata: RegistryComponentRow | null = comp.componentId
            ? await deps.getRegistryComponentById(comp.componentId)
            : null;

          const manifest = manifestStore.buildManifest({
            requirementId: comp.id ?? comp.componentId,
            componentName: comp.componentName,
            tfrsClasses,
            componentMetadata,
            planId: comp.planId,
          });
          await deps.persistManifest(manifest, { jobId: comp.jobId, planId: comp.planId });

          return { id: comp.id, adaptedCode, tfrsClasses, manifest };
        })
      );

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
