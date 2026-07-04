import { query, queryOne } from '../../db/client';
import { getProvider } from '../providers';
import { logEvent } from '../audit';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Load Blair's system prompt
const BLAIR_SYSTEM_PROMPT = (() => {
  try {
    const promptPath = path.resolve(__dirname, '../../../../prompts/blair-system-prompt.md');
    return fs.readFileSync(promptPath, 'utf8');
  } catch {
    return 'You are Blair, a senior AI coding assistant. Follow the Define → Plan → Build → Verify → Review → Ship lifecycle.';
  }
})();

export interface JobInput {
  repoUrl: string;
  baseBranch?: string;
  prompt: string;
  provider?: string;
}

// ─────────────────────────────────────────────
// Create a new job and immediately start it async
// ─────────────────────────────────────────────
export async function createJob(input: JobInput): Promise<{ id: string }> {
  const id = uuidv4();
  await query(
    `INSERT INTO jobs (id, repo_url, base_branch, prompt, status, provider)
     VALUES ($1, $2, $3, $4, 'queued', $5)`,
    [id, input.repoUrl, input.baseBranch || 'develop', input.prompt, input.provider || 'mock']
  );
  await logEvent(id, 'job.created', { repoUrl: input.repoUrl, baseBranch: input.baseBranch });

  // Run the pipeline async — don't await here so the HTTP response returns immediately
  runJobPipeline(id).catch(err => {
    console.error(`[orchestrator] Job ${id} failed:`, err.message);
    updateJobStatus(id, 'failed', err.message);
  });

  return { id };
}

export async function getJob(id: string) {
  return queryOne(`SELECT * FROM jobs WHERE id = $1`, [id]);
}

export async function listJobs(limit = 20) {
  return query(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1`, [limit]);
}

// ─────────────────────────────────────────────
// The core pipeline — runs each step in sequence
// ─────────────────────────────────────────────
async function runJobPipeline(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const provider = getProvider(job.provider);

  // ── Step 1: PLAN ──
  await updateJobStatus(jobId, 'planning');
  await logEvent(jobId, 'job.planning.started');

  const planResponse = await provider.complete(
    [{ role: 'user', content: `Repository: ${job.repo_url}\nBase branch: ${job.base_branch}\n\nUser request:\n${job.prompt}\n\nProduce a JSON plan with: assumptions, data_model, file_manifest, component_sourcing, risks.` }],
    BLAIR_SYSTEM_PROMPT
  );

  await query(
    `INSERT INTO plans (job_id, plan_json) VALUES ($1, $2)`,
    [jobId, JSON.stringify({ raw: planResponse.content })]
  );
  await logEvent(jobId, 'job.planning.complete', { tokens: planResponse.outputTokens });

  // ── Step 2: BRANCH NAME ──
  const featureBranch = `feature/blair-${jobId.slice(0, 8)}`;
  await query(`UPDATE jobs SET feature_branch = $1 WHERE id = $2`, [featureBranch, jobId]);
  await logEvent(jobId, 'job.branch.created', { branch: featureBranch });

  // ── Step 3: BUILD (placeholder — real impl uses GitHub API + sandbox) ──
  await updateJobStatus(jobId, 'building');
  await logEvent(jobId, 'job.building.started');
  // TODO: Clone repo, checkout feature branch, run agent, commit files
  await logEvent(jobId, 'job.building.complete');

  // ── Step 4: QA (placeholder) ──
  await updateJobStatus(jobId, 'qa');
  await logEvent(jobId, 'job.qa.started');
  // TODO: Run npm lint, build, typecheck, test — persist to qa_runs table
  await logEvent(jobId, 'job.qa.complete');

  // ── Step 5: PREVIEW (placeholder) ──
  await updateJobStatus(jobId, 'preview');
  // TODO: Expose Vite dev server, set preview_url
  await logEvent(jobId, 'job.preview.ready');

  // ── Step 6: REVIEW ──
  await updateJobStatus(jobId, 'review');
  await logEvent(jobId, 'job.review.ready', { branch: featureBranch });
  // Job stays in 'review' until user approves and triggers PR
}

async function updateJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
    [status, errorMessage || null, jobId]
  );
}
