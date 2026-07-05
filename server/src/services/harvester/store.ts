import { query } from '../../db/client';
import { Component, getAdapter } from './registry';

export interface RegistryComponentRow {
  id: string;
  name: string;
  source: 'internal' | 'shadcn';
  category: string;
  version: string;
  license: string;
  dependencies: string[];
  tfrs_classes: string[];
  description: string | null;
  discovered_at: string;
  updated_at: string;
}

export interface SyncResult {
  source: 'internal' | 'shadcn';
  count: number;
}

const ADAPTER_TYPES: Array<'internal' | 'shadcn'> = ['internal', 'shadcn'];

async function upsertComponent(component: Component): Promise<void> {
  await query(
    `INSERT INTO registry_components (name, source, category, version, license, dependencies, tfrs_classes, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (source, name) DO UPDATE SET
       category = EXCLUDED.category,
       version = EXCLUDED.version,
       license = EXCLUDED.license,
       dependencies = EXCLUDED.dependencies,
       tfrs_classes = EXCLUDED.tfrs_classes,
       description = EXCLUDED.description,
       updated_at = NOW()`,
    [
      component.name,
      component.source,
      component.category,
      component.version,
      component.license,
      JSON.stringify(component.dependencies),
      JSON.stringify(component.tfrsClasses),
      component.description ?? null,
    ]
  );
}

/**
 * Runs every registry adapter's getAll() and upserts the results into
 * registry_components. This is the function the future weekly harvester job
 * (automation-and-scheduling) will call on a cron; for now it's exposed
 * manually via POST /api/registry/sync.
 */
export async function syncRegistry(types: Array<'internal' | 'shadcn'> = ADAPTER_TYPES): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const type of types) {
    const adapter = getAdapter(type);
    const components = await adapter.getAll();
    for (const component of components) {
      await upsertComponent(component);
    }
    results.push({ source: type, count: components.length });
  }
  return results;
}

export async function listRegistryComponents(source?: 'internal' | 'shadcn'): Promise<RegistryComponentRow[]> {
  if (source) {
    return query<RegistryComponentRow>(`SELECT * FROM registry_components WHERE source = $1 ORDER BY name`, [source]);
  }
  return query<RegistryComponentRow>(`SELECT * FROM registry_components ORDER BY source, name`);
}

export async function searchRegistryComponents(q: string): Promise<RegistryComponentRow[]> {
  return query<RegistryComponentRow>(
    `SELECT * FROM registry_components
     WHERE name ILIKE $1 OR category ILIKE $1 OR description ILIKE $1
     ORDER BY name`,
    [`%${q}%`]
  );
}
