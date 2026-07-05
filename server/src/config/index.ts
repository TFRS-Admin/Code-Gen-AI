import dotenv from 'dotenv';
dotenv.config();

export interface GithubTokenStatus {
  hasToken: boolean;
  tokenLength: number;
  message: string;
}

/**
 * Centralized GITHUB_TOKEN validation. Re-reads process.env on every call
 * (rather than caching the result) so the github service and routes always
 * see the current state — important on Railway, where a redeploy after
 * fixing a missing/misconfigured var should be visible without relying on
 * any module-level snapshot going stale.
 */
export function checkGithubToken(): GithubTokenStatus {
  const token = process.env.GITHUB_TOKEN ?? '';

  if (token.trim() === '') {
    return {
      hasToken: false,
      tokenLength: token.length,
      message:
        'GITHUB_TOKEN is not set. On Railway, set it in the service Variables tab (not just the project level) and redeploy.',
    };
  }

  return {
    hasToken: true,
    tokenLength: token.length,
    message: 'GITHUB_TOKEN loaded.',
  };
}

/** Logs GITHUB_TOKEN presence/length at startup so Railway deploy logs make token issues obvious immediately. */
export function logGithubTokenStatus(): GithubTokenStatus {
  const status = checkGithubToken();
  if (status.hasToken) {
    console.log(`[blair-server] ✓ GITHUB_TOKEN loaded (length: ${status.tokenLength})`);
  } else {
    console.warn(`[blair-server] ✗ GITHUB_TOKEN not usable: ${status.message}`);
  }
  return status;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL || '',
  },
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },
    default: (process.env.DEFAULT_PROVIDER || 'mock') as 'mock' | 'openai' | 'anthropic',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  // RAILWAY_PROJECT_ID is the Railway project that hosts feature-branch
  // preview deploys. Railway's built-in preview environments publish each
  // branch at https://<branch-name>-<project-id>.railway.app — the
  // orchestrator (services/orchestrator) derives that URL from this ID and
  // the job's feature branch name once the branch is created.
  railway: {
    projectId: process.env.RAILWAY_PROJECT_ID || '',
  },
};
