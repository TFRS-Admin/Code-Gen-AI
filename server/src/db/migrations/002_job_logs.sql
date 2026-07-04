-- Blair Platform: Job output log streaming
-- Adds an append-only text column the orchestrator writes to as each
-- pipeline step runs, so the frontend can display live output.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_logs TEXT NOT NULL DEFAULT '';
