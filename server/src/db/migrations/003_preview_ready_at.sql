-- Blair Platform: Railway preview deploy readiness tracking
-- Records the moment the orchestrator confirmed the Railway preview deploy
-- for a job's feature branch responded 200 OK (see services/orchestrator).
-- preview_url itself already exists on jobs (001_initial.sql); it is only
-- populated once preview_ready_at is set, so a non-null preview_url always
-- means "confirmed reachable", never "expected but unverified".

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS preview_ready_at TIMESTAMPTZ;
