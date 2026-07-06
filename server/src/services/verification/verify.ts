import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { query } from '../../db/client';
import { materializeWorkspace, WorkspaceFilesFetcher } from './workspace';
import { readPackageJson, detectAvailableChecks, runInstall, runCommand, CheckResult, ExecFileImpl } from './checks';

export interface QaRunRow {
  id: string;
  job_id: string;
  lint_passed: boolean | null;
  build_passed: boolean | null;
  typecheck_passed: boolean | null;
  tests_passed: boolean | null;
  lint_output: string | null;
  build_output: string | null;
  typecheck_output: string | null;
  test_output: string | null;
  created_at: string;
}

export interface NewQaRun {
  jobId: string;
  lintPassed: boolean | null;
  lintOutput: string | null;
}

/** Inserts one qa_runs row. build/typecheck/tests columns are left at their column default (NULL) — out of scope for slice 1. */
export async function persistQaRun(input: NewQaRun): Promise<QaRunRow> {
  const rows = await query<QaRunRow>(
    `INSERT INTO qa_runs (job_id, lint_passed, lint_output)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.jobId, input.lintPassed, input.lintOutput]
  );
  return rows[0];
}

export interface RunVerificationInput {
  jobId: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface RunVerificationDeps {
  fetchRepoFiles?: WorkspaceFilesFetcher;
  exec?: ExecFileImpl;
  persistQaRun?: (input: NewQaRun) => Promise<QaRunRow>;
  checkTimeoutMs?: number;
  installTimeoutMs?: number;
}

export interface VerificationResult {
  lint: CheckResult;
  qaRun: QaRunRow;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

function lintPassedFromOutcome(outcome: CheckResult['outcome']): boolean | null {
  if (outcome === 'passed') return true;
  if (outcome === 'failed') return false;
  return null; // 'errored' or 'skipped' — not a real pass/fail signal
}

/**
 * M4 slice 1: materializes a job's feature branch, runs its `lint` script if
 * one exists, and persists one real qa_runs row. Per
 * docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md section 10, this slice
 * deliberately does not gate the pipeline (a failed/errored lint still lets
 * the job proceed to preview/review) and does not implement a repair loop —
 * both are scoped to later slices.
 */
export async function runVerification(
  input: RunVerificationInput,
  deps: RunVerificationDeps = {}
): Promise<VerificationResult> {
  const persist = deps.persistQaRun ?? persistQaRun;

  let workspace;
  try {
    workspace = await materializeWorkspace(
      { owner: input.owner, repo: input.repo, branch: input.branch },
      { fetchRepoFiles: deps.fetchRepoFiles }
    );
  } catch (err: any) {
    // Materialization failure is an infrastructure problem, not evidence the
    // generated code is wrong — classified "errored", same as a timed-out check.
    const lint: CheckResult = {
      outcome: 'errored',
      output: `Workspace materialization failed: ${err?.message ?? err}`,
      exitCode: null,
    };
    const qaRun = await persist({ jobId: input.jobId, lintPassed: lintPassedFromOutcome(lint.outcome), lintOutput: lint.output });
    return { lint, qaRun };
  }

  try {
    const packageJsonRaw = await readPackageJson(workspace.dir);
    const available = detectAvailableChecks(packageJsonRaw);

    if (!available.lint) {
      const lint: CheckResult = { outcome: 'skipped', output: '', exitCode: null };
      const qaRun = await persist({ jobId: input.jobId, lintPassed: lintPassedFromOutcome(lint.outcome), lintOutput: null });
      return { lint, qaRun };
    }

    const hasLockfile = await fileExists(path.join(workspace.dir, 'package-lock.json'));
    const install = await runInstall({
      cwd: workspace.dir,
      hasLockfile,
      exec: deps.exec,
      timeoutMs: deps.installTimeoutMs,
    });

    if (install.outcome !== 'passed') {
      const lint: CheckResult = {
        outcome: 'errored',
        output: `Dependency install did not complete, so lint could not run:\n${install.output}`,
        exitCode: null,
      };
      const qaRun = await persist({ jobId: input.jobId, lintPassed: lintPassedFromOutcome(lint.outcome), lintOutput: lint.output });
      return { lint, qaRun };
    }

    const lint = await runCommand('lint', { cwd: workspace.dir, exec: deps.exec, timeoutMs: deps.checkTimeoutMs });
    const qaRun = await persist({
      jobId: input.jobId,
      lintPassed: lintPassedFromOutcome(lint.outcome),
      lintOutput: lint.output || null,
    });
    return { lint, qaRun };
  } finally {
    await workspace.cleanup();
  }
}
