-- Blair Platform: Component manifest persistence (M3.3)
-- Durable record of the manifest produced each time the harvester adapts a
-- component (server/src/routes/adapt.ts), so a harvest can be traced back to
-- its source, license, and TFRS adaptations after the fact.
--
-- Per adr/0007-manifest-persistence-data-model.md: this is an additive table
-- on the existing lean jobs/plans schema, not the full ERD in
-- docs/10-data-model.md. job_id/plan_id are nullable FKs (adapt is often
-- called standalone, outside any job/plan) following the provider_calls
-- precedent (001_initial.sql) of a nullable, ON DELETE SET NULL job
-- reference. manifest_id/generation_plan_id are separate TEXT columns
-- holding the schema-compatible synthetic IDs (hc_*/plan_*) required by
-- contracts/component-manifest.schema.json, which raw UUIDs do not satisfy.

CREATE TABLE IF NOT EXISTS component_manifests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id             TEXT NOT NULL UNIQUE,
  generation_plan_id      TEXT NOT NULL,
  job_id                  UUID REFERENCES jobs(id) ON DELETE SET NULL,
  plan_id                 UUID REFERENCES plans(id) ON DELETE SET NULL,
  requirement_id          TEXT NOT NULL,
  component_name          TEXT NOT NULL,
  source_type             TEXT NOT NULL CHECK (source_type IN ('internal','base44','shadcn','github','custom')),
  source_name             TEXT NOT NULL,
  source_url              TEXT,
  license                 TEXT NOT NULL,
  score                   INT NOT NULL CHECK (score >= 0 AND score <= 100),
  original_files          JSONB NOT NULL DEFAULT '[]',
  adapted_files           JSONB NOT NULL DEFAULT '[]',
  dependencies_added      JSONB NOT NULL DEFAULT '[]',
  dependencies_removed    JSONB NOT NULL DEFAULT '[]',
  tfrs_adaptations        JSONB NOT NULL DEFAULT '[]',
  risk_notes              JSONB NOT NULL DEFAULT '[]',
  custom_build_exception  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_component_manifests_job_id ON component_manifests(job_id);
CREATE INDEX IF NOT EXISTS idx_component_manifests_plan_id ON component_manifests(plan_id);
