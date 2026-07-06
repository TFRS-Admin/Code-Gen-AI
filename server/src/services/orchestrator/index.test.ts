import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewUrl, pollPreviewReady, decideRepairAction, mergeGeneratedFiles, buildRepairUserMessage } from './index';
import type { GeneratedFile } from './index';
import { config } from '../../config';
import type { CheckName, CheckOutcome, CheckResult } from '../verification/checks';
import type { VerificationResult, QaRunRow } from '../verification/verify';

/** Runs fn with config.railway.projectId set to value, then restores the original. */
async function withRailwayProjectId<T>(value: string, fn: () => Promise<T> | T): Promise<T> {
  const original = config.railway.projectId;
  config.railway.projectId = value;
  try {
    return await fn();
  } finally {
    config.railway.projectId = original;
  }
}

test('buildPreviewUrl: constructs the Railway preview URL from the branch name and project id', async () => {
  await withRailwayProjectId('proj-abc123', () => {
    const url = buildPreviewUrl('feature/blair-a1b2c3d4');
    assert.equal(url, 'https://feature-blair-a1b2c3d4-proj-abc123.railway.app');
  });
});

test('buildPreviewUrl: lowercases and collapses non-alphanumeric characters in the branch name', async () => {
  await withRailwayProjectId('proj-abc123', () => {
    const url = buildPreviewUrl('Feature/BLAIR_Test--Branch!!');
    assert.equal(url, 'https://feature-blair-test-branch-proj-abc123.railway.app');
  });
});

test('buildPreviewUrl: returns null when RAILWAY_PROJECT_ID is not configured', async () => {
  await withRailwayProjectId('', () => {
    const url = buildPreviewUrl('feature/blair-a1b2c3d4');
    assert.equal(url, null);
  });
});

test('pollPreviewReady: returns true immediately when the first response is 200', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return { status: 200 } as Response;
  }) as unknown as typeof fetch;

  const ready = await pollPreviewReady('https://example.railway.app', {
    fetchImpl,
    sleepImpl: async () => {},
  });

  assert.equal(ready, true);
  assert.equal(calls, 1);
});

test('pollPreviewReady: keeps polling through non-200 responses until one succeeds', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return { status: calls < 3 ? 503 : 200 } as Response;
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];

  const ready = await pollPreviewReady('https://example.railway.app', {
    intervalMs: 5000,
    timeoutMs: 60000,
    fetchImpl,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.equal(ready, true);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [5000, 5000]);
});

test('pollPreviewReady: keeps polling through fetch errors (deploy not reachable yet)', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    if (calls < 2) throw new Error('ENOTFOUND example.railway.app');
    return { status: 200 } as Response;
  }) as unknown as typeof fetch;

  const ready = await pollPreviewReady('https://example.railway.app', {
    fetchImpl,
    sleepImpl: async () => {},
  });

  assert.equal(ready, true);
  assert.equal(calls, 2);
});

test('pollPreviewReady: gives up and returns false once the timeout elapses', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return { status: 503 } as Response;
  }) as unknown as typeof fetch;

  const ready = await pollPreviewReady('https://example.railway.app', {
    intervalMs: 1000,
    timeoutMs: 3000,
    fetchImpl,
    sleepImpl: async () => {},
  });

  assert.equal(ready, false);
  assert.equal(calls, 3); // ceil(3000ms / 1000ms) = 3 attempts, no sleep after the last
});

// ─────────────────────────────────────────────
// M4 slice 3: bounded repair loop
// ─────────────────────────────────────────────

const ALL_CHECK_NAMES: CheckName[] = ['lint', 'build', 'typecheck', 'test'];

function makeCheckResult(outcome: CheckOutcome, output = ''): CheckResult {
  return { outcome, output, exitCode: outcome === 'passed' ? 0 : outcome === 'failed' ? 1 : null };
}

function fakeQaRun(): QaRunRow {
  return {
    id: 'qa-x',
    job_id: 'job-x',
    lint_passed: null,
    build_passed: null,
    typecheck_passed: null,
    tests_passed: null,
    lint_output: null,
    build_output: null,
    typecheck_output: null,
    test_output: null,
    created_at: '2026-07-06T00:00:00.000Z',
  };
}

/** Builds a VerificationResult with the given per-check outcomes (default 'passed'), computing `ok` the same way verify.ts's isOk() does. */
function makeVerification(
  overrides: Partial<Record<CheckName, CheckOutcome>>,
  outputs: Partial<Record<CheckName, string>> = {}
): VerificationResult {
  const checks = {} as Record<CheckName, CheckResult>;
  for (const name of ALL_CHECK_NAMES) {
    const outcome = overrides[name] ?? 'passed';
    checks[name] = makeCheckResult(outcome, outputs[name] ?? (outcome === 'failed' ? `${name} failed` : ''));
  }
  const ok = ALL_CHECK_NAMES.every((name) => checks[name].outcome === 'passed' || checks[name].outcome === 'skipped');
  return { checks, ok, qaRun: fakeQaRun() };
}

test('decideRepairAction: proceeds immediately when verification passed (no repair attempted)', () => {
  const verification = makeVerification({});
  assert.deepEqual(decideRepairAction(verification, 1, 2), { action: 'proceed' });
});

test('decideRepairAction: a skipped check never triggers repair on its own', () => {
  const verification = makeVerification({ typecheck: 'skipped', test: 'skipped' });
  assert.deepEqual(decideRepairAction(verification, 1, 2), { action: 'proceed' });
});

test('decideRepairAction: a failed check triggers a repair attempt', () => {
  const verification = makeVerification({ lint: 'failed' }, { lint: '1 problem (no-unused-vars)' });
  assert.deepEqual(decideRepairAction(verification, 1, 2), {
    action: 'repair',
    attemptNumber: 1,
    failedChecks: ['lint'],
  });
});

test('decideRepairAction: an errored check never triggers repair, even alongside a failed check', () => {
  const verification = makeVerification({ lint: 'failed', build: 'errored' });
  const decision = decideRepairAction(verification, 1, 2);
  assert.equal(decision.action, 'fail');
  assert.equal((decision as { reason: string }).reason, 'errored');
  assert.equal((decision as { detail: string }).detail, 'build');
});

test('decideRepairAction: repairs up to the cap (2), then fails once the budget is exhausted', () => {
  const verification = makeVerification({ lint: 'failed' });

  // qaRunsCountForJob=1 -> repairsUsed=0 -> first repair
  assert.deepEqual(decideRepairAction(verification, 1, 2), {
    action: 'repair',
    attemptNumber: 1,
    failedChecks: ['lint'],
  });

  // qaRunsCountForJob=2 -> repairsUsed=1 -> second repair
  assert.deepEqual(decideRepairAction(verification, 2, 2), {
    action: 'repair',
    attemptNumber: 2,
    failedChecks: ['lint'],
  });

  // qaRunsCountForJob=3 -> repairsUsed=2 -> budget exhausted, job fails
  const decision = decideRepairAction(verification, 3, 2);
  assert.equal(decision.action, 'fail');
  assert.equal((decision as { reason: string }).reason, 'repair_budget_exhausted');
  assert.equal((decision as { detail: string }).detail, 'lint');
});

test('decideRepairAction: a full sequence — fails, repairs twice, then a repair succeeds and reaches proceed', () => {
  const failing = makeVerification({ lint: 'failed' });

  const first = decideRepairAction(failing, 1, 2);
  assert.equal(first.action, 'repair');

  const second = decideRepairAction(failing, 2, 2);
  assert.equal(second.action, 'repair');

  // The second repair fixed it — the next verification attempt now passes.
  const passing = makeVerification({});
  const third = decideRepairAction(passing, 3, 2);
  assert.deepEqual(third, { action: 'proceed' });
});

test('decideRepairAction: reports every failed check, not just the first, for a multi-check failure', () => {
  const verification = makeVerification({ lint: 'failed', test: 'failed' });
  const decision = decideRepairAction(verification, 1, 2);
  assert.equal(decision.action, 'repair');
  assert.deepEqual((decision as { failedChecks: CheckName[] }).failedChecks, ['lint', 'test']);
});

test('mergeGeneratedFiles: later files overwrite earlier ones at the same path; others are preserved', () => {
  const first = mergeGeneratedFiles(new Map(), [
    { path: 'src/A.jsx', content: 'v1', action: 'create' },
    { path: 'src/B.jsx', content: 'v1', action: 'create' },
  ] as GeneratedFile[]);
  const second = mergeGeneratedFiles(first, [{ path: 'src/A.jsx', content: 'v2', action: 'update' } as GeneratedFile]);

  assert.equal(second.size, 2);
  assert.equal(second.get('src/A.jsx')?.content, 'v2');
  assert.equal(second.get('src/B.jsx')?.content, 'v1');
});

test("buildRepairUserMessage: includes the plan, generated files so far, and every failing check's exact output", () => {
  const plan = { summary: 'Add login page' };
  const files: GeneratedFile[] = [{ path: 'src/Login.jsx', content: 'export default function Login() {}', action: 'create' }];
  const message = buildRepairUserMessage(plan, files, [{ name: 'lint', output: '1 problem: no-unused-vars' }]);

  assert.match(message, /Add login page/);
  assert.match(message, /src\/Login\.jsx/);
  assert.match(message, /export default function Login/);
  assert.match(message, /### lint/);
  assert.match(message, /no-unused-vars/);
});

test('buildRepairUserMessage: lists multiple failing checks distinctly when more than one failed', () => {
  const message = buildRepairUserMessage({}, [], [
    { name: 'lint', output: 'lint problem' },
    { name: 'test', output: 'test problem' },
  ]);
  assert.match(message, /### lint/);
  assert.match(message, /lint problem/);
  assert.match(message, /### test/);
  assert.match(message, /test problem/);
});
