import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { query } from '../../db/client';
import { materializeWorkspace, WorkspaceFilesFetcher } from './workspace';
import {
  readPackageJson,
  detectAvailableChecks,
  runInstall,
  runCommand,
  CheckResult,
  CheckName,
  AvailableChecks,
  ExecFileImpl,
} from './checks';

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

// Field names mirror the qa_runs columns 1:1 (camelCase), including the
// schema's own lint_passed/build_passed/typecheck_passed/tests_passed +
// test_output naming (note: "tests_passed" is plural, "test_output" is
// singular — that's the existing 001_initial.sql schema, not a typo here).
export interface NewQaRun {
  jobId: string;
  lintPassed: boolean | null;
  lintOutput: string | null;
  buildPassed: boolean | null;
  buildOutput: string | null;
  typecheckPassed: boolean | null;
  typecheckOutput: string | null;
  testsPassed: boolean | null;
  testOutput: string | null;
}

/** Inserts one qa_runs row with all four checks' results. */
export async function persistQaRun(input: NewQaRun): Promise<QaRunRow> {
  const rows = await query<QaRunRow>(
    `INSERT INTO qa_runs (
       job_id, lint_passed, lint_output, build_passed, build_output,
       typecheck_passed, typecheck_output, tests_passed, test_output
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.jobId,
      input.lintPassed,
      input.lintOutput,
      input.buildPassed,
      input.buildOutput,
      input.typecheckPassed,
      input.typecheckOutput,
      input.testsPassed,
      input.testOutput,
    ]
  );
  return rows[0];
}

/** Returns a job's qa_runs rows, most recent first. */
export async function listQaRuns(jobId: string): Promise<QaRunRow[]> {
  return query<QaRunRow>(`SELECT * FROM qa_runs WHERE job_id = $1 ORDER BY created_at DESC`, [jobId]);
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

export type CheckResults = Record<CheckName, CheckResult>;

export interface VerificationResult {
  checks: CheckResults;
  /** True only if every check that actually ran passed (skipped checks don't count against this). */
  ok: boolean;
  qaRun: QaRunRow;
}

// Deterministic run order — also the order the original placeholder logged
// these in ("Running lint... Running build... Running typecheck... Running tests...").
const CHECK_ORDER: CheckName[] = ['lint', 'build', 'typecheck', 'test'];

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

function passedFromOutcome(outcome: CheckResult['outcome']): boolean | null {
  if (outcome === 'passed') return true;
  if (outcome === 'failed') return false;
  return null; // 'errored' or 'skipped' — not a real pass/fail signal
}

// durationMs is `null` (not 0) for both: neither actually invoked a command
// (see checks.ts's CheckResult doc — an install/materialization failure
// upstream of the check running, or the check never being attempted at all),
// so there is no elapsed time to report, and `null` keeps that distinct from
// "ran in 0ms".
function erroredResult(message: string): CheckResult {
  return { outcome: 'errored', output: message, exitCode: null, durationMs: null };
}

function skippedResult(): CheckResult {
  return { outcome: 'skipped', output: '', exitCode: null, durationMs: null };
}

function allChecks(build: (name: CheckName) => CheckResult): CheckResults {
  const checks = {} as CheckResults;
  for (const name of CHECK_ORDER) checks[name] = build(name);
  return checks;
}

function toNewQaRun(jobId: string, checks: CheckResults): NewQaRun {
  return {
    jobId,
    lintPassed: passedFromOutcome(checks.lint.outcome),
    lintOutput: checks.lint.output || null,
    buildPassed: passedFromOutcome(checks.build.outcome),
    buildOutput: checks.build.output || null,
    typecheckPassed: passedFromOutcome(checks.typecheck.outcome),
    typecheckOutput: checks.typecheck.output || null,
    testsPassed: passedFromOutcome(checks.test.outcome),
    testOutput: checks.test.output || null,
  };
}

/** A check that never ran (skipped) never blocks the job — only a real failed/errored outcome does. */
function isOk(checks: CheckResults): boolean {
  return CHECK_ORDER.every((name) => checks[name].outcome === 'passed' || checks[name].outcome === 'skipped');
}

/**
 * M4 slice 2: materializes a job's feature branch, runs every check the
 * target repo defines (lint/build/typecheck/test — never fabricating one
 * that isn't defined), and persists one real qa_runs row with all four
 * results. `ok` tells the caller (the orchestrator) whether to gate the
 * pipeline; this function only reports what actually happened and does not
 * implement a repair loop (slice 3).
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
    // generated code is wrong — every check is "errored", none "failed".
    const message = `Workspace materialization failed: ${err?.message ?? err}`;
    const checks = allChecks(() => erroredResult(message));
    const qaRun = await persist(toNewQaRun(input.jobId, checks));
    return { checks, ok: isOk(checks), qaRun };
  }

  try {
    const packageJsonRaw = await readPackageJson(workspace.dir);
    const available: AvailableChecks = detectAvailableChecks(packageJsonRaw);

    if (!CHECK_ORDER.some((name) => available[name])) {
      const checks = allChecks(() => skippedResult());
      const qaRun = await persist(toNewQaRun(input.jobId, checks));
      return { checks, ok: isOk(checks), qaRun };
    }

    const hasLockfile = await fileExists(path.join(workspace.dir, 'package-lock.json'));
    const install = await runInstall({
      cwd: workspace.dir,
      hasLockfile,
      exec: deps.exec,
      timeoutMs: deps.installTimeoutMs,
    });

    if (install.outcome !== 'passed') {
      // No available check can meaningfully run without dependencies installed —
      // each becomes "errored" (not "failed"); checks that were never going to
      // run anyway stay "skipped" regardless of the install outcome.
      const message = `Dependency install did not complete, so checks could not run:\n${install.output}`;
      const checks = allChecks((name) => (available[name] ? erroredResult(message) : skippedResult()));
      const qaRun = await persist(toNewQaRun(input.jobId, checks));
      return { checks, ok: isOk(checks), qaRun };
    }

    const checks = {} as CheckResults;
    for (const name of CHECK_ORDER) {
      checks[name] = available[name]
        ? await runCommand(name, { cwd: workspace.dir, exec: deps.exec, timeoutMs: deps.checkTimeoutMs })
        : skippedResult();
    }

    const qaRun = await persist(toNewQaRun(input.jobId, checks));
    return { checks, ok: isOk(checks), qaRun };
  } finally {
    await workspace.cleanup();
  }
}
