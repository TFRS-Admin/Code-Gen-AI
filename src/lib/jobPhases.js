// Canonical Blair Agent Lifecycle phases (docs/05-agent-lifecycle.md), mapped
// from the job status values the server persists (server/src/services/orchestrator).
// Shared by RightPanel's timeline strip and the chat's inline phase progress
// so both surfaces agree on what "the current phase" means for a job.
export const JOB_PHASES = [
  { key: "define", label: "Define", statuses: ["queued"] },
  { key: "plan", label: "Plan", statuses: ["planning"] },
  { key: "build", label: "Build", statuses: ["building"] },
  { key: "verify", label: "Verify", statuses: ["qa", "preview"] },
  { key: "review", label: "Review", statuses: ["review"] },
  { key: "ship", label: "Ship", statuses: ["pr_opened", "shipped"] },
];

const STATUS_ORDER = JOB_PHASES.flatMap((phase) => phase.statuses);

const FAILED_STATUSES = new Set(["failed", "cancelled"]);

export function jobHasFailed(job) {
  return !!job && FAILED_STATUSES.has(job.status);
}

// Returns "complete" | "active" | "pending" for a given phase, given the
// job's current status. Failed/cancelled jobs report every phase "pending"
// so callers can render a distinct failure indicator instead.
export function jobPhaseState(job, phase) {
  if (!job || jobHasFailed(job)) return "pending";
  const currentIndex = STATUS_ORDER.indexOf(job.status);
  const phaseFirstIndex = STATUS_ORDER.indexOf(phase.statuses[0]);
  const phaseLastIndex = STATUS_ORDER.indexOf(phase.statuses[phase.statuses.length - 1]);
  if (currentIndex > phaseLastIndex) return "complete";
  if (currentIndex >= phaseFirstIndex && currentIndex <= phaseLastIndex) return "active";
  return "pending";
}
