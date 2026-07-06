import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerification, NewQaRun, QaRunRow } from './verify';
import type { RepoFilesResult } from '../github';

function fakeResult(files: RepoFilesResult['files']): RepoFilesResult {
  return { files, totalTreeEntries: Object.keys(files).length, includedFiles: Object.keys(files).length, truncated: false };
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
      build_passed: null,
      typecheck_passed: null,
      tests_passed: null,
      lint_output: input.lintOutput,
      build_output: null,
      typecheck_output: null,
      test_output: null,
      created_at: '2026-07-06T00:00:00.000Z',
    };
  };
  return { calls, persistQaRun };
}

test('runVerification: skips lint and persists a null (not fabricated) result when no lint script exists', async () => {
  const fetchRepoFiles = async () => fakeResult({ 'package.json': { content: '{"scripts":{}}', language: 'json' } });
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-1', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, persistQaRun }
  );

  assert.equal(result.lint.outcome, 'skipped');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { jobId: 'job-1', lintPassed: null, lintOutput: null });
});

test('runVerification: installs dependencies, runs lint, and persists a real passed result', async () => {
  const fetchRepoFiles = async () =>
    fakeResult({ 'package.json': { content: '{"scripts":{"lint":"eslint ."}}', language: 'json' } });
  const execCalls: string[][] = [];
  const exec = async (_command: string, args: string[]) => {
    execCalls.push(args);
    if (args[0] === 'install') return { stdout: 'added 1 package', stderr: '' };
    return { stdout: 'no problems', stderr: '' };
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-2', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.equal(result.lint.outcome, 'passed');
  assert.deepEqual(execCalls, [['install'], ['run', 'lint']]);
  assert.deepEqual(calls[0], { jobId: 'job-2', lintPassed: true, lintOutput: 'no problems' });
});

test('runVerification: runs "npm ci" instead of "npm install" when a lockfile was materialized', async () => {
  const fetchRepoFiles = async () =>
    fakeResult({
      'package.json': { content: '{"scripts":{"lint":"eslint ."}}', language: 'json' },
      'package-lock.json': { content: '{}', language: 'json' },
    });
  const execCalls: string[][] = [];
  const exec = async (_command: string, args: string[]) => {
    execCalls.push(args);
    return { stdout: 'ok', stderr: '' };
  };
  const { persistQaRun } = recordingPersist();

  await runVerification(
    { jobId: 'job-3', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.deepEqual(execCalls[0], ['ci']);
});

test('runVerification: persists a real failed result when lint finds problems', async () => {
  const fetchRepoFiles = async () =>
    fakeResult({ 'package.json': { content: '{"scripts":{"lint":"eslint ."}}', language: 'json' } });
  const exec = async (_command: string, args: string[]) => {
    if (args[0] === 'install') return { stdout: '', stderr: '' };
    const err: any = new Error('lint failed');
    err.code = 1;
    err.stdout = '';
    err.stderr = '1 problem (1 error, 0 warnings)';
    throw err;
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-4', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.equal(result.lint.outcome, 'failed');
  assert.deepEqual(calls[0], { jobId: 'job-4', lintPassed: false, lintOutput: '1 problem (1 error, 0 warnings)' });
});

test('runVerification: persists a null (not fabricated) result when workspace materialization fails', async () => {
  const fetchRepoFiles = async () => {
    throw new Error('GitHub API error: rate limited');
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-5', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, persistQaRun }
  );

  assert.equal(result.lint.outcome, 'errored');
  assert.equal(calls[0].lintPassed, null);
  assert.match(calls[0].lintOutput ?? '', /rate limited/);
});

test('runVerification: persists a null (not fabricated) result when dependency install fails', async () => {
  const fetchRepoFiles = async () =>
    fakeResult({ 'package.json': { content: '{"scripts":{"lint":"eslint ."}}', language: 'json' } });
  const exec = async () => {
    const err: any = new Error('npm ERR! network timeout');
    err.code = 1;
    err.stderr = 'npm ERR! network timeout';
    throw err;
  };
  const { calls, persistQaRun } = recordingPersist();

  const result = await runVerification(
    { jobId: 'job-6', owner: 'acme', repo: 'demo', branch: 'feature/x' },
    { fetchRepoFiles, exec, persistQaRun }
  );

  assert.equal(result.lint.outcome, 'errored');
  assert.equal(calls[0].lintPassed, null);
});
