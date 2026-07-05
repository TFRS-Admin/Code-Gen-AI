-- Blair Platform: Component registry (M3 Harvester foundation)
-- Durable catalog of components discovered by registry adapters
-- (server/src/services/harvester), so the weekly harvester job has
-- something to diff/update against instead of re-discovering from scratch.

CREATE TABLE IF NOT EXISTS registry_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('internal','shadcn')),
  category        TEXT NOT NULL,
  version         TEXT NOT NULL,
  license         TEXT NOT NULL,
  dependencies    JSONB NOT NULL DEFAULT '[]',
  tfrs_classes    JSONB NOT NULL DEFAULT '[]',
  description     TEXT,
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, name)
);

CREATE INDEX IF NOT EXISTS idx_registry_components_source ON registry_components(source);
CREATE INDEX IF NOT EXISTS idx_registry_components_category ON registry_components(category);
