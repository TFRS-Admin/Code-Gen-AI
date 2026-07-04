import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGithubToken, logGithubTokenStatus } from './index';

/** Runs fn with process.env.GITHUB_TOKEN set to value (or deleted, if undefined), then restores the original. */
async function withGithubToken<T>(value: string | undefined, fn: () => Promise<T> | T): Promise<T> {
  const original = process.env.GITHUB_TOKEN;
  if (value === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = value;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = original;
  }
}

test('checkGithubToken: reports hasToken:false and tokenLength:0 when GITHUB_TOKEN is unset', async () => {
  await withGithubToken(undefined, () => {
    const status = checkGithubToken();
    assert.equal(status.hasToken, false);
    assert.equal(status.tokenLength, 0);
    assert.match(status.message, /not set/i);
  });
});

test('checkGithubToken: reports hasToken:false when GITHUB_TOKEN is blank/whitespace', async () => {
  await withGithubToken('   ', () => {
    const status = checkGithubToken();
    assert.equal(status.hasToken, false);
  });
});

test('checkGithubToken: reports hasToken:true and the exact token length when GITHUB_TOKEN is set', async () => {
  const token = 'ghp_1234567890abcdef1234567890abcdef1234';
  await withGithubToken(token, () => {
    const status = checkGithubToken();
    assert.equal(status.hasToken, true);
    assert.equal(status.tokenLength, token.length);
    assert.match(status.message, /loaded/i);
  });
});

test('logGithubTokenStatus: logs a ✓ line and returns hasToken:true when GITHUB_TOKEN is set', async () => {
  await withGithubToken('ghp_test_token_value_1234567890', () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
    try {
      const status = logGithubTokenStatus();
      assert.equal(status.hasToken, true);
      assert.ok(logs.some((l) => l.includes('✓ GITHUB_TOKEN loaded')));
    } finally {
      console.log = originalLog;
    }
  });
});

test('logGithubTokenStatus: warns and returns hasToken:false when GITHUB_TOKEN is missing', async () => {
  await withGithubToken(undefined, () => {
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(' '));
    };
    try {
      const status = logGithubTokenStatus();
      assert.equal(status.hasToken, false);
      assert.ok(warnings.some((w) => w.includes('GITHUB_TOKEN not usable')));
    } finally {
      console.warn = originalWarn;
    }
  });
});
