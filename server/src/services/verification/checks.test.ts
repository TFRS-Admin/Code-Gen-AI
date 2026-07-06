import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectAvailableChecks, readPackageJson, runCommand, runInstall } from './checks';

const ALL_FALSE = { lint: false, build: false, typecheck: false, test: false };

test('detectAvailableChecks: returns all-false for missing package.json content', () => {
  assert.deepEqual(detectAvailableChecks(null), ALL_FALSE);
  assert.deepEqual(detectAvailableChecks(undefined), ALL_FALSE);
});

test('detectAvailableChecks: returns all-false for unparsable JSON rather than throwing', () => {
  assert.deepEqual(detectAvailableChecks('{not valid json'), ALL_FALSE);
});

test('detectAvailableChecks: returns all-false when scripts is missing entirely', () => {
  assert.deepEqual(detectAvailableChecks('{"name":"demo"}'), ALL_FALSE);
});

test('detectAvailableChecks: detects exactly the scripts that are present, never fabricating the rest', () => {
  const pkg = JSON.stringify({ scripts: { lint: 'eslint .', test: 'vitest run' } });
  assert.deepEqual(detectAvailableChecks(pkg), { lint: true, build: false, typecheck: false, test: true });
});

test('detectAvailableChecks: ignores a non-string script value instead of treating it as present', () => {
  const pkg = JSON.stringify({ scripts: { lint: null, build: 42 } });
  const result = detectAvailableChecks(pkg);
  assert.equal(result.lint, false);
  assert.equal(result.build, false);
});

test('readPackageJson: returns the file content when package.json exists', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'blair-verify-checks-test-'));
  try {
    await fsp.writeFile(path.join(dir, 'package.json'), '{"name":"demo"}', 'utf8');
    assert.equal(await readPackageJson(dir), '{"name":"demo"}');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('readPackageJson: returns null when package.json is absent, rather than throwing', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'blair-verify-checks-test-'));
  try {
    assert.equal(await readPackageJson(dir), null);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runCommand: classifies a zero exit code as passed, and reports a measured duration', async () => {
  const exec = async () => ({ stdout: 'no problems', stderr: '' });
  const result = await runCommand('lint', { cwd: '/tmp', exec });
  assert.equal(result.outcome, 'passed');
  assert.equal(result.output, 'no problems');
  assert.equal(result.exitCode, 0);
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs! >= 0);
});

test('runCommand: classifies a non-zero exit code as failed, preserving output and reporting a duration', async () => {
  const exec = async () => {
    const err: any = new Error('Command failed');
    err.code = 1;
    err.stdout = '';
    err.stderr = 'src/App.jsx\n  1:1  error  no-unused-vars';
    throw err;
  };
  const result = await runCommand('lint', { cwd: '/tmp', exec });
  assert.equal(result.outcome, 'failed');
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /no-unused-vars/);
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs! >= 0);
});

test('runCommand: classifies a timeout as errored, not failed, and still reports a duration', async () => {
  const exec = async () => {
    const err: any = new Error('Command timed out');
    err.killed = true;
    err.signal = 'SIGTERM';
    throw err;
  };
  const result = await runCommand('lint', { cwd: '/tmp', exec, timeoutMs: 5000 });
  assert.equal(result.outcome, 'errored');
  assert.equal(result.exitCode, null);
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs! >= 0);
});

test('runCommand: classifies a spawn-level error (ENOENT) as errored, not failed, and still reports a duration', async () => {
  const exec = async () => {
    const err: any = new Error('spawn npm ENOENT');
    err.code = 'ENOENT';
    throw err;
  };
  const result = await runCommand('lint', { cwd: '/tmp', exec });
  assert.equal(result.outcome, 'errored');
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs! >= 0);
});

test('runInstall: uses "npm ci" when a lockfile was materialized', async () => {
  let calledArgs: string[] | undefined;
  const exec = async (_cmd: string, args: string[]) => {
    calledArgs = args;
    return { stdout: '', stderr: '' };
  };
  await runInstall({ cwd: '/tmp', hasLockfile: true, exec });
  assert.deepEqual(calledArgs, ['ci']);
});

test('runInstall: uses "npm install" when no lockfile was materialized', async () => {
  let calledArgs: string[] | undefined;
  const exec = async (_cmd: string, args: string[]) => {
    calledArgs = args;
    return { stdout: '', stderr: '' };
  };
  await runInstall({ cwd: '/tmp', hasLockfile: false, exec });
  assert.deepEqual(calledArgs, ['install']);
});

test('runInstall: classifies a failed install as errored, never failed, and reports a duration', async () => {
  const exec = async () => {
    const err: any = new Error('npm ERR! 404 Not Found');
    err.code = 1;
    err.stdout = '';
    err.stderr = 'npm ERR! 404 Not Found - some-package';
    throw err;
  };
  const result = await runInstall({ cwd: '/tmp', hasLockfile: false, exec });
  assert.equal(result.outcome, 'errored');
  assert.match(result.output, /404 Not Found/);
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs! >= 0);
});

test('runInstall: classifies a timed-out install as errored, and reports a duration', async () => {
  const exec = async () => {
    const err: any = new Error('Command timed out');
    err.killed = true;
    err.signal = 'SIGTERM';
    throw err;
  };
  const result = await runInstall({ cwd: '/tmp', hasLockfile: false, exec });
  assert.equal(result.outcome, 'errored');
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs! >= 0);
});

test('runInstall: a successful install reports a measured duration', async () => {
  const exec = async () => ({ stdout: 'added 1 package', stderr: '' });
  const result = await runInstall({ cwd: '/tmp', hasLockfile: false, exec });
  assert.equal(result.outcome, 'passed');
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs! >= 0);
});
