-- Blair Platform: Initial Schema
-- Covers: jobs, generation requests, plans, provider calls, audit events

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- JOBS
-- A Job is the top-level unit of work: connect repo → branch → implement → QA → preview → PR
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_url        TEXT NOT NULL,
  base_branch     TEXT NOT NULL DEFAULT 'develop',
  feature_branch  TEXT,
  prompt          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','planning','building','qa','preview','review','pr_opened','shipped','failed','cancelled')),
  provider        TEXT NOT NULL DEFAULT 'mock',
  model           TEXT,
  preview_url     TEXT,
  pr_url          TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PLANS
-- A Plan is the JSON spec Blair produces before writing any code
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  plan_json       JSONB NOT NULL DEFAULT '{}',
  approved        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- QA RUNS
-- Stores the output of lint/build/typecheck/test for each job
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  lint_passed     BOOLEAN,
  build_passed    BOOLEAN,
  typecheck_passed BOOLEAN,
  tests_passed    BOOLEAN,
  lint_output     TEXT,
  build_output    TEXT,
  typecheck_output TEXT,
  test_output     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PROVIDER CALLS
-- Logs every LLM API call for cost tracking and debugging
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  purpose         TEXT NOT NULL CHECK (purpose IN ('consult','plan','implement','repair','review','summarize')),
  status          TEXT NOT NULL CHECK (status IN ('pending','success','error')),
  latency_ms      INT,
  input_tokens    INT,
  output_tokens   INT,
  error_code      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AUDIT EVENTS
-- Immutable log of all lifecycle transitions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  event_data      JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plans_job_id ON plans(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_runs_job_id ON qa_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_provider_calls_job_id ON provider_calls(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_job_id ON audit_events(job_id);
