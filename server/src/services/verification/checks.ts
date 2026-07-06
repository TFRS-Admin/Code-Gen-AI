import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

// The four Verify-phase checks from docs/05-agent-lifecycle.md ("Required"
// tier: lint, type check, unit tests, plus build). Generic across all four
// so slices 2+ can reuse detectAvailableChecks/runCommand as-is — this
// slice only wires `lint` into the orchestrator.
export type CheckName = 'lint' | 'build' | 'typecheck' | 'test';

const CHECK_NAMES: CheckName[] = ['lint', 'build', 'typecheck', 'test'];

export type AvailableChecks = Record<CheckName, boolean>;

/**
 * Reads package.json from a materialized workspace directory. Returns null
 * if it's absent or unreadable rather than throwing — a connected repo may
 * not be a Node project at all, which isn't an error condition.
 */
export async function readPackageJson(workspaceDir: string): Promise<string | null> {
  try {
    return await fsp.readFile(path.join(workspaceDir, 'package.json'), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Detects which checks the target repo actually defines, per
 * docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md section 4: never fabricate
 * availability. A missing or unparsable package.json, or a scripts object
 * missing a given key, reports that check as unavailable — never "true" by
 * assumption.
 */
export function detectAvailableChecks(packageJsonRaw: string | null | undefined): AvailableChecks {
  const result = { lint: false, build: false, typecheck: false, test: false } as AvailableChecks;
  if (!packageJsonRaw) return result;

  let parsed: any;
  try {
    parsed = JSON.parse(packageJsonRaw);
  } catch {
    return result;
  }

  const scripts = parsed && typeof parsed === 'object' ? parsed.scripts : undefined;
  if (!scripts || typeof scripts !== 'object') return result;

  for (const name of CHECK_NAMES) {
    result[name] = typeof scripts[name] === 'string' && scripts[name].trim().length > 0;
  }
  return result;
}

export type CheckOutcome = 'passed' | 'failed' | 'errored' | 'skipped';

export interface CheckResult {
  outcome: CheckOutcome;
  output: string;
  exitCode: number | null;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Injectable child-process runner. The default implementation
 * (promisify(execFile)) never invokes a shell, so nothing passed through
 * here is vulnerable to shell metacharacter injection — args are passed as
 * an argv array, not interpolated into a command string.
 */
export type ExecFileImpl = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number }
) => Promise<ExecResult>;

const execFileAsync = promisify(execFileCb);
const defaultExec: ExecFileImpl = (command, args, options) => execFileAsync(command, args, options);

const DEFAULT_CHECK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const DEFAULT_INSTALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — installs are typically slower than a single check
const MAX_EXEC_BUFFER_BYTES = 1024 * 1024; // 1MB, mirrors the file-size bounding already used in github.ts
const MAX_STORED_OUTPUT_CHARS = 20000; // keeps qa_runs rows and job_logs lines bounded
const OUTPUT_TRUNCATION_NOTE = '\n... [output truncated]';

function combineOutput(stdout: string, stderr: string): string {
  const combined = [stdout, stderr].filter(Boolean).join('\n');
  if (combined.length <= MAX_STORED_OUTPUT_CHARS) return combined;
  return combined.slice(0, MAX_STORED_OUTPUT_CHARS) + OUTPUT_TRUNCATION_NOTE;
}

export interface RunCommandOptions {
  cwd: string;
  timeoutMs?: number;
  exec?: ExecFileImpl;
}

/**
 * Runs `npm run <scriptName>` and classifies the result per
 * docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md section 5:
 *   - exit code 0                    -> passed
 *   - non-zero exit code              -> failed (the tool ran and found problems)
 *   - timeout / spawn error (ENOENT)  -> errored (infrastructure, not a code problem)
 */
export async function runCommand(scriptName: CheckName, options: RunCommandOptions): Promise<CheckResult> {
  const exec = options.exec ?? defaultExec;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;

  try {
    const { stdout, stderr } = await exec('npm', ['run', scriptName], {
      cwd: options.cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_EXEC_BUFFER_BYTES,
    });
    return { outcome: 'passed', output: combineOutput(stdout, stderr), exitCode: 0 };
  } catch (err: any) {
    return classifyExecError(err, `${scriptName} timed out after ${timeoutMs}ms`);
  }
}

export interface RunInstallOptions {
  cwd: string;
  hasLockfile: boolean;
  timeoutMs?: number;
  exec?: ExecFileImpl;
}

/**
 * Runs `npm ci` (if a lockfile was materialized) or `npm install`. Any
 * failure here — bad deps, registry/network issues, timeout — is always
 * "errored", never "failed": it isn't evidence the *generated code* has a
 * problem, and the caller should not attempt to run a check afterward.
 */
export async function runInstall(options: RunInstallOptions): Promise<CheckResult> {
  const exec = options.exec ?? defaultExec;
  const timeoutMs = options.timeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS;
  const args = options.hasLockfile ? ['ci'] : ['install'];

  try {
    const { stdout, stderr } = await exec('npm', args, {
      cwd: options.cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_EXEC_BUFFER_BYTES,
    });
    return { outcome: 'passed', output: combineOutput(stdout, stderr), exitCode: 0 };
  } catch (err: any) {
    const classified = classifyExecError(err, `npm ${args[0]} timed out after ${timeoutMs}ms`);
    // Install has no "found problems in the code" outcome — a non-zero exit
    // here is still an infrastructure/environment failure, not a "failed" check.
    return classified.outcome === 'failed' ? { ...classified, outcome: 'errored' } : classified;
  }
}

function classifyExecError(err: any, timeoutMessage: string): CheckResult {
  const stdout = typeof err?.stdout === 'string' ? err.stdout : '';
  const stderr = typeof err?.stderr === 'string' ? err.stderr : '';
  const output = combineOutput(stdout, stderr);

  if (err?.killed || err?.signal) {
    return { outcome: 'errored', output: output || timeoutMessage, exitCode: null };
  }
  if (typeof err?.code === 'number') {
    return { outcome: 'failed', output, exitCode: err.code };
  }
  // Anything else (ENOENT — npm not found, other spawn-level errors) is an
  // infrastructure error, not evidence the generated code is wrong.
  return { outcome: 'errored', output: output || String(err?.message ?? err), exitCode: null };
}
