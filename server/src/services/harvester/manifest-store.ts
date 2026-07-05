import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { query } from '../../db/client';
import type { RegistryComponentRow } from './store';

// Mirrors contracts/component-manifest.schema.json field-for-field (same
// required/optional split, same patterns/enum/range) so a manifest built by
// buildManifest() and a manifest read back from Postgres both parse against
// the same contract. Candidate scoring (docs/06-component-harvester.md:49-65,
// TICKET-029) is not implemented yet, so `score` is populated with a fixed
// placeholder in buildManifest() below rather than a computed signal.
export const ComponentManifestSchema = z
  .object({
    manifestId: z
      .string()
      .regex(/^hc_[A-Za-z0-9_-]+$/, 'manifestId must match ^hc_[A-Za-z0-9_-]+$'),
    generationPlanId: z
      .string()
      .regex(/^plan_[A-Za-z0-9_-]+$/, 'generationPlanId must match ^plan_[A-Za-z0-9_-]+$'),
    requirementId: z.string().min(1),
    componentName: z.string().min(1),
    sourceType: z.enum(['internal', 'base44', 'shadcn', 'github', 'custom']),
    sourceName: z.string().min(1),
    sourceUrl: z.string().optional(),
    license: z.string().min(1),
    score: z.number().int().min(0).max(100),
    originalFiles: z.array(z.string()),
    adaptedFiles: z.array(z.string()),
    dependenciesAdded: z.array(z.string()),
    dependenciesRemoved: z.array(z.string()),
    tfrsAdaptations: z.array(z.string()),
    riskNotes: z.array(z.string()),
    customBuildException: z.string().optional(),
  })
  .strict();

export type ComponentManifest = z.infer<typeof ComponentManifestSchema>;

export interface ComponentManifestRow {
  id: string;
  manifest_id: string;
  generation_plan_id: string;
  job_id: string | null;
  plan_id: string | null;
  requirement_id: string;
  component_name: string;
  source_type: ComponentManifest['sourceType'];
  source_name: string;
  source_url: string | null;
  license: string;
  score: number;
  original_files: string[];
  adapted_files: string[];
  dependencies_added: string[];
  dependencies_removed: string[];
  tfrs_adaptations: string[];
  risk_notes: string[];
  custom_build_exception: string | null;
  created_at: string;
}

export interface ManifestContext {
  jobId?: string | null;
  planId?: string | null;
}

export interface BuildManifestInput {
  requirementId?: string;
  componentName?: string;
  tfrsClasses: string[];
  componentMetadata: RegistryComponentRow | null;
  planId?: string | null;
}

// score is not a computed signal — candidate scoring (TICKET-029) does not
// exist yet. These are fixed placeholders: a registry match is assumed
// broadly acceptable (it already passed the M3.1 registry adapters' license
// checks); an unmatched/custom adaptation is unscored/unvetted.
const REGISTRY_MATCH_PLACEHOLDER_SCORE = 100;
const UNMATCHED_CUSTOM_PLACEHOLDER_SCORE = 0;

function mintManifestId(): string {
  return `hc_${uuidv4()}`;
}

function mintGenerationPlanId(planId?: string | null): string {
  return planId ? `plan_${planId}` : `plan_adhoc_${uuidv4()}`;
}

/**
 * Builds a schema-valid manifest from an adapt-route call. When
 * componentMetadata is present (the caller passed a componentId that matched
 * a registry_components row), the manifest is sourced from that row. When
 * it's absent, the manifest records the adaptation as an unmatched/custom
 * source rather than fabricating provenance data that isn't available at
 * this stage (no file paths, dependency diff, or license are known for raw
 * pasted code).
 */
export function buildManifest(input: BuildManifestInput): ComponentManifest {
  const requirementId = input.requirementId?.trim() || `adhoc_${uuidv4()}`;
  const { componentMetadata } = input;

  const base = {
    manifestId: mintManifestId(),
    generationPlanId: mintGenerationPlanId(input.planId),
    requirementId,
    tfrsAdaptations: input.tfrsClasses,
    originalFiles: [] as string[],
    adaptedFiles: [] as string[],
  };

  if (componentMetadata) {
    return ComponentManifestSchema.parse({
      ...base,
      componentName: input.componentName?.trim() || componentMetadata.name,
      sourceType: componentMetadata.source,
      sourceName: componentMetadata.name,
      license: componentMetadata.license,
      score: REGISTRY_MATCH_PLACEHOLDER_SCORE,
      dependenciesAdded: componentMetadata.dependencies,
      dependenciesRemoved: [],
      riskNotes: [],
    });
  }

  return ComponentManifestSchema.parse({
    ...base,
    componentName: input.componentName?.trim() || 'unnamed-component',
    sourceType: 'custom',
    sourceName: 'custom',
    license: 'unknown',
    score: UNMATCHED_CUSTOM_PLACEHOLDER_SCORE,
    dependenciesAdded: [],
    dependenciesRemoved: [],
    riskNotes: ['No registry component matched — provenance and license are unknown.'],
    customBuildException: 'Adapted directly from provided code without a tracked registry source.',
  });
}

/** Validates an arbitrary value against the manifest contract, e.g. before trusting a persisted row or an external payload. */
export function validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const result = ComponentManifestSchema.safeParse(manifest);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.') || '(root)'}: ${e.message}`),
  };
}

/** Pure mapping from a manifest to component_manifests' column shape — used by persistManifest and directly by tests to verify the row round-trips back to the same manifest via rowToManifest(). */
export function manifestToRow(
  manifest: ComponentManifest,
  context: ManifestContext = {}
): Omit<ComponentManifestRow, 'id' | 'created_at'> {
  return {
    manifest_id: manifest.manifestId,
    generation_plan_id: manifest.generationPlanId,
    job_id: context.jobId ?? null,
    plan_id: context.planId ?? null,
    requirement_id: manifest.requirementId,
    component_name: manifest.componentName,
    source_type: manifest.sourceType,
    source_name: manifest.sourceName,
    source_url: manifest.sourceUrl ?? null,
    license: manifest.license,
    score: manifest.score,
    original_files: manifest.originalFiles,
    adapted_files: manifest.adaptedFiles,
    dependencies_added: manifest.dependenciesAdded,
    dependencies_removed: manifest.dependenciesRemoved,
    tfrs_adaptations: manifest.tfrsAdaptations,
    risk_notes: manifest.riskNotes,
    custom_build_exception: manifest.customBuildException ?? null,
  };
}

/**
 * Inverse of manifestToRow — reconstructs the schema-shaped manifest from a
 * persisted (or fabricated, in tests) row. Omits sourceUrl/customBuildException
 * entirely when the row column is null, rather than setting them to
 * `undefined`, so a manifest built without them round-trips to an
 * identically-shaped object (a present `key: undefined` is not the same as
 * an absent key under strict deep-equality).
 */
export function rowToManifest(row: Omit<ComponentManifestRow, 'id' | 'created_at' | 'job_id' | 'plan_id'>): ComponentManifest {
  return ComponentManifestSchema.parse({
    manifestId: row.manifest_id,
    generationPlanId: row.generation_plan_id,
    requirementId: row.requirement_id,
    componentName: row.component_name,
    sourceType: row.source_type,
    sourceName: row.source_name,
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    license: row.license,
    score: row.score,
    originalFiles: row.original_files,
    adaptedFiles: row.adapted_files,
    dependenciesAdded: row.dependencies_added,
    dependenciesRemoved: row.dependencies_removed,
    tfrsAdaptations: row.tfrs_adaptations,
    riskNotes: row.risk_notes,
    ...(row.custom_build_exception ? { customBuildException: row.custom_build_exception } : {}),
  });
}

/**
 * Persists a manifest built by buildManifest(). Follows the
 * registry_components/store.ts precedent: flat columns, JSON.stringify for
 * JSONB array fields, RETURNING * to hand back the stored row.
 */
export async function persistManifest(
  manifest: ComponentManifest,
  context: ManifestContext = {}
): Promise<ComponentManifestRow> {
  const row = manifestToRow(manifest, context);
  const rows = await query<ComponentManifestRow>(
    `INSERT INTO component_manifests (
       manifest_id, generation_plan_id, job_id, plan_id, requirement_id, component_name,
       source_type, source_name, source_url, license, score, original_files, adapted_files,
       dependencies_added, dependencies_removed, tfrs_adaptations, risk_notes, custom_build_exception
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      row.manifest_id,
      row.generation_plan_id,
      row.job_id,
      row.plan_id,
      row.requirement_id,
      row.component_name,
      row.source_type,
      row.source_name,
      row.source_url,
      row.license,
      row.score,
      JSON.stringify(row.original_files),
      JSON.stringify(row.adapted_files),
      JSON.stringify(row.dependencies_added),
      JSON.stringify(row.dependencies_removed),
      JSON.stringify(row.tfrs_adaptations),
      JSON.stringify(row.risk_notes),
      row.custom_build_exception,
    ]
  );
  return rows[0];
}

export async function getManifestById(manifestId: string): Promise<ComponentManifestRow | null> {
  const rows = await query<ComponentManifestRow>(
    `SELECT * FROM component_manifests WHERE manifest_id = $1`,
    [manifestId]
  );
  return rows[0] ?? null;
}
