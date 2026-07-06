import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerification, NewQaRun, QaRunRow } from './verify';
import type { RepoFilesResult } from '../github';

function fakeResult(files: RepoFilesResult['files']): RepoFilesResult {
  return { files, totalTreeEntries: Object.keys(files).length, includedFiles: Object.keys(files).length, truncated: false };
}

function packageJsonWithScripts(scripts: Record<string, string>): RepoFilesResult['files'] {
  return { 'package.json': { content: JSON.stringify({ scripts }), language: 'json' } };
}

/** Records every qa_runs row runVerification asks to persist, without touching a real database. */
function recordingPersist() {
  const calls: NewQaRun[] = [];
  const persistQaRun = async (input: NewQaRun): Promise<QaRunRow> => {
    calls.push(input);
    return {
      id: `qa-${calls.length}`,
      job_id: input.jobId,
      lint_passed: input.lintPassed,
      build_passed: input.buildPassed,
      typecheck_passed: input.typecheckPassed,
      tests_passed: input.testsPassed,
      lint_output: input.lintOutput,
      build_output: input.buildOutput,
      typecheck_output: input.typecheckOutput,
      test_output: input.testOutput,
      created_at: '2026-07-06T00:00:00.000Z',
    };
  };
  return { calls, persistQaRun };
}

test('runVerification: skips every check and persists an all-null result when package.json has no scripts', async () => {
  const fetchRepoFiles = async () => fakeResult(packageJsonWithScripts({}));
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-1', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, persistQaRun }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.checks).map(([k, v]) => [k, v.outcome])),
    { lint: 'skipped', build: 'skipped', typecheck: 'skipped', test: 'skipped' }
  );
  // Skipped checks never ran, so duration is explicitly null (not 0) for all of them.
  for (const name of ['lint', 'build', 'typecheck', 'test'] as const) {
    assert.equal(result.checks[name].durationMs, null);
  }
  assert.deepEqual(calls[0], {
    jobId: 'job-1',
    lintPassed: null,
    lintOutput: null,
    buildPassed: null,
    buildOutput: null,
    typecheckPassed: null,
    typecheckOutput: null,
    testsPassed: null,
    testOutput: null,
  });
});

test('runVerification: runs only the checks the target repo defines, skipping the rest', async () => {
  const fetchRepoFiles = async () => fakeResult(packageJsonWithScripts({ lint: 'eslint .', test: 'vitest run' }));
  const runCalls: string[] = [];
  const exec = async (_command: string, args: string[]) => {
    if (args[0] === 'run') {
      runCalls.push(args[1]);
      return { stdout: `${args[1]} ok`, stderr: '' };
    }
    return { stdout: '', stderr: '' }; // install
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-2', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.deepEqual(runCalls, ['lint', 'test']); // build/typecheck never invoked
  assert.equal(result.checks.build.outcome, 'skipped');
  assert.equal(result.checks.typecheck.outcome, 'skipped');
  assert.equal(result.checks.lint.outcome, 'passed');
  assert.equal(result.checks.test.outcome, 'passed');
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], {
    jobId: 'job-2',
    lintPassed: true,
    lintOutput: 'lint ok',
    buildPassed: null,
    buildOutput: null,
    typecheckPassed: null,
    typecheckOutput: null,
    testsPassed: true,
    testOutput: 'test ok',
  });
});

test('runVerification: runs all four checks in order and persists a fully-passed row', async () => {
  const fetchRepoFiles = async () =>
    fakeResult(packageJsonWithScripts({ lint: 'eslint .', build: 'vite build', typecheck: 'tsc', test: 'vitest run' }));
  const runCalls: string[] = [];
  const exec = async (_command: string, args: string[]) => {
    if (args[0] === 'run') {
      runCalls.push(args[1]);
      return { stdout: `${args[1]} ok`, stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-3', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.deepEqual(runCalls, ['lint', 'build', 'typecheck', 'test']);
  assert.equal(result.ok, true);
  // Every check actually ran (via runCommand), so each reports a real measured duration.
  for (const name of ['lint', 'build', 'typecheck', 'test'] as const) {
    assert.equal(typeof result.checks[name].durationMs, 'number');
    assert.ok(result.checks[name].durationMs! >= 0);
  }
  assert.deepEqual(calls[0], {
    jobId: 'job-3',
    lintPassed: true,
    lintOutput: 'lint ok',
    buildPassed: true,
    buildOutput: 'build ok',
    typecheckPassed: true,
    typecheckOutput: 'typecheck ok',
    testsPassed: true,
    testOutput: 'test ok',
  });
});

test('runVerification: a failed lint blocks "ok" even when the other three checks pass', async () => {
  const fetchRepoFiles = async () =>
    fakeResult(packageJsonWithScripts({ lint: 'eslint .', build: 'vite build', typecheck: 'tsc', test: 'vitest run' }));
  const exec = async (_command: string, args: string[]) => {
    if (args[0] === 'run' && args[1] === 'lint') {
      const err: any = new Error('lint failed');
      err.code = 1;
      err.stderr = '1 problem (1 error, 0 warnings)';
      throw err;
    }
    if (args[0] === 'run') return { stdout: `${args[1]} ok`, stderr: '' };
    return { stdout: '', stderr: '' };
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-4', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.equal(result.ok, false);
  assert.equal(result.checks.lint.outcome, 'failed');
  assert.equal(result.checks.build.outcome, 'passed');
  assert.equal(result.checks.typecheck.outcome, 'passed');
  assert.equal(result.checks.test.outcome, 'passed');
  // The failed check still actually ran, so it reports a real duration too.
  assert.equal(typeof result.checks.lint.durationMs, 'number');
  assert.equal(calls[0].lintPassed, false);
  assert.equal(calls[0].buildPassed, true);
});

test('runVerification: an errored check (e.g. timeout) blocks "ok" the same as a failed one', async () => {
  const fetchRepoFiles = async () => fakeResult(packageJsonWithScripts({ build: 'vite build' }));
  const exec = async (_command: string, args: string[]) => {
    if (args[0] === 'run' && args[1] === 'build') {
      const err: any = new Error('timed out');
      err.killed = true;
      err.signal = 'SIGTERM';
      throw err;
    }
    return { stdout: '', stderr: '' };
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-5', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.equal(result.ok, false);
  assert.equal(result.checks.build.outcome, 'errored');
  // The timeout still happened mid-execution, so it reports a real duration too.
  assert.equal(typeof result.checks.build.durationMs, 'number');
  assert.equal(calls[0].buildPassed, null); // never fabricated as failed or passed
});

test('runVerification: a skipped check never blocks "ok" on its own', async () => {
  const fetchRepoFiles = async () => fakeResult(packageJsonWithScripts({ lint: 'eslint .' }));
  const exec = async (_command: string, args: string[]) => {
    if (args[0] === 'run') return { stdout: 'clean', stderr: '' };
    return { stdout: '', stderr: '' };
  };
  const { persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-6', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.equal(result.checks.lint.outcome, 'passed');
  assert.equal(result.checks.build.outcome, 'skipped');
  assert.equal(result.checks.typecheck.outcome, 'skipped');
  assert.equal(result.checks.test.outcome, 'skipped');
  assert.equal(result.ok, true);
});

test('runVerification: runs "npm ci" instead of "npm install" when a lockfile was materialized', async () => {
  const files = packageJsonWithScripts({ lint: 'eslint .' });
  files['package-lock.json'] = { content: '{}', language: 'json' };
  const fetchRepoFiles = async () => fakeResult(files);
  const execCalls: string[][] = [];
  const exec = async (_command: string, args: string[]) => {
    execCalls.push(args);
    return { stdout: 'ok', stderr: '' };
  };
  const { persistQaRun } = recordingPersist();

  await runVerification({ jobId: 'job-7', owner: 'acme', repo: 'demo', branch: 'feature/x' }, { fetchRepoFiles, exec, persistQaRun });

  assert.deepEqual(execCalls[0], ['ci']);
});

test('runVerification: when install fails, every available check is errored and unavailable ones stay skipped', async () => {
  const fetchRepoFiles = async () => fakeResult(packageJsonWithScripts({ lint: 'eslint .', test: 'vitest run' }));
  const exec = async () => {
    const err: any = new Error('npm ERR! network timeout');
    err.code = 1;
    err.stderr = 'npm ERR! network timeout';
    throw err;
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-8', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.equal(result.ok, false);
  assert.equal(result.checks.lint.outcome, 'errored');
  assert.equal(result.checks.test.outcome, 'errored');
  assert.equal(result.checks.build.outcome, 'skipped');
  assert.equal(result.checks.typecheck.outcome, 'skipped');
  // Install failed before any check's command ran, so even the "errored"
  // (not just "skipped") checks report null duration, not a fabricated 0.
  assert.equal(result.checks.lint.durationMs, null);
  assert.equal(result.checks.test.durationMs, null);
  assert.equal(result.checks.build.durationMs, null);
  assert.equal(result.checks.typecheck.durationMs, null);
  assert.equal(calls[0].lintPassed, null);
  assert.equal(calls[0].buildPassed, null);
});

test('runVerification: when workspace materialization fails, every check is errored (not fabricated as failed)', async () => {
  const fetchRepoFiles = async () => {
    throw new Error('GitHub API error: rate limited');
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-9', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, persistQaRun }
  );

  assert.equal(result.ok, false);
  for (const name of ['lint', 'build', 'typecheck', 'test'] as const) {
    assert.equal(result.checks[name].outcome, 'errored');
    assert.match(result.checks[name].output, /rate limited/);
    // Errored here because materialization never got far enough to run a
    // command at all — durationMs is null, not a fabricated 0.
    assert.equal(result.checks[name].durationMs, null);
  }
  assert.equal(calls[0].lintPassed, null);
  assert.equal(calls[0].buildPassed, null);
  assert.equal(calls[0].typecheckPassed, null);
  assert.equal(calls[0].testsPassed, null);
});
