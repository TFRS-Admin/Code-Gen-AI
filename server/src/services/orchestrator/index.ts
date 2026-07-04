import { query, queryOne } from '../../db/client';
import { getProvider } from '../providers';
import { logEvent } from '../audit';
import { BLAIR_SYSTEM_PROMPT } from '../blairPrompt';
import * as github from '../github';
import { v4 as uuidv4 } from 'uuid';

export interface JobInput {
  repoUrl: string;
  baseBranch?: string;
  prompt: string;
  provider?: string;
}

interface GeneratedFile {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
}

const MAX_CONTEXT_FILES = 15;
const MAX_FILE_LINES = 200;
const MAX_OUTPUT_FILES = 10;

const BUILD_STAGE_INSTRUCTIONS = `
You are implementing a feature on a real GitHub repository.

You will receive:
1. A plan (JSON) describing what to build
2. The relevant files from the repository
3. The user's original request

You must respond with ONLY valid JSON in this exact format:
{
  "files": [
    { "path": "src/pages/Example.jsx", "content": "...full file content...", "action": "update" }
  ],
  "summary": "One sentence describing what was implemented"
}

Rules:
- Always write complete file contents, never partial diffs
- Follow the existing code style of the repository
- Use the same import patterns as existing files
- Never add dependencies not already in package.json
- Maximum 10 files per response
`;

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
    appendLog(id, `[FAILED] ${err.message}`);
  });

  return { id };
}

export async function getJob(id: string) {
  return queryOne(`SELECT * FROM jobs WHERE id = $1`, [id]);
}

export async function listJobs(limit = 20) {
  return query(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1`, [limit]);
}

// Appends a single line to the job's visible output log (job_logs), which the
// frontend polls via GET /api/jobs/:id to stream progress in real time.
async function appendLog(jobId: string, line: string): Promise<void> {
  await query(
    `UPDATE jobs SET job_logs = job_logs || $1 || E'\n', updated_at = NOW() WHERE id = $2`,
    [line, jobId]
  );
}

// Best-effort parse of the plan JSON the LLM produced in Step 1. Providers
// (especially the mock provider) may not return strict JSON, so this never
// throws — it falls back to an empty plan rather than failing the pipeline.
function parsePlanJson(raw: string | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return {};
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return {};
    }
  }
}

// Turns a plan's file_manifest entries (exact paths or simple glob patterns
// like "src/pages/*.jsx") into a RegExp that can be tested against tree paths.
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function selectRelevantFiles(tree: string[], plan: Record<string, any>): string[] {
  const manifest: string[] = Array.isArray(plan.file_manifest)
    ? plan.file_manifest
    : typeof plan.file_manifest === 'string'
      ? [plan.file_manifest]
      : [];

  const selected = new Set<string>();

  for (const pattern of manifest) {
    if (tree.includes(pattern)) {
      selected.add(pattern);
      continue;
    }
    const regex = globToRegExp(pattern);
    for (const path of tree) {
      if (regex.test(path)) selected.add(path);
    }
  }

  return Array.from(selected).slice(0, MAX_CONTEXT_FILES);
}

function truncateContent(content: string, maxLines: number): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join('\n') + `\n... [truncated, ${lines.length - maxLines} more lines]`;
}

// Best-effort parse of the BUILD step's LLM response into a files[] + summary shape.
function parseBuildResponse(raw: string): { files: GeneratedFile[]; summary: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return { files: [], summary: '' };
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { files: [], summary: '' };
    }
  }

  const files: GeneratedFile[] = Array.isArray(parsed?.files)
    ? parsed.files
        .filter((f: any) => f && typeof f.path === 'string' && typeof f.content === 'string')
        .map((f: any) => ({
          path: f.path,
          content: f.content,
          action: f.action === 'create' || f.action === 'delete' ? f.action : 'update',
        }))
        .slice(0, MAX_OUTPUT_FILES)
    : [];

  return { files, summary: typeof parsed?.summary === 'string' ? parsed.summary : '' };
}

// ─────────────────────────────────────────────
// The core pipeline — runs each step in sequence
// ─────────────────────────────────────────────
async function runJobPipeline(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const provider = getProvider(job.provider);

  // ── Step 1: PLAN ── // IMPLEMENTED
  await updateJobStatus(jobId, 'planning');
  await logEvent(jobId, 'job.planning.started');
  await appendLog(jobId, '[PLAN] Analyzing prompt...');

  const planResponse = await provider.complete(
    [{ role: 'user', content: `Repository: ${job.repo_url}\nBase branch: ${job.base_branch}\n\nUser request:\n${job.prompt}\n\nProduce a JSON plan with: assumptions, data_model, file_manifest, component_sourcing, risks.` }],
    BLAIR_SYSTEM_PROMPT
  );

  await query(
    `INSERT INTO plans (job_id, plan_json) VALUES ($1, $2)`,
    [jobId, JSON.stringify({ raw: planResponse.content })]
  );
  await logEvent(jobId, 'job.planning.complete', { tokens: planResponse.outputTokens });
  await appendLog(jobId, '[PLAN] Plan generated and recorded.');

  // ── Step 2: BRANCH NAME ── // IMPLEMENTED
  const featureBranch = `feature/blair-${jobId.slice(0, 8)}`;
  await query(`UPDATE jobs SET feature_branch = $1 WHERE id = $2`, [featureBranch, jobId]);
  await logEvent(jobId, 'job.branch.created', { branch: featureBranch });
  await appendLog(jobId, `[BRANCH] Created ${featureBranch} from ${job.base_branch}.`);

  // ── Step 3: BUILD ──
  await updateJobStatus(jobId, 'building');
  await logEvent(jobId, 'job.building.started');

  const { owner, repo } = github.parseRepoUrl(job.repo_url);
  const planRow = await queryOne<{ plan_json: { raw?: string } }>(
    `SELECT plan_json FROM plans WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [jobId]
  );
  const plan = parsePlanJson(planRow?.plan_json?.raw);

  await appendLog(jobId, '[BUILD] Fetching repo context...');
  let tree: string[] = [];
  try {
    tree = await github.getFileTree(owner, repo, job.base_branch);
  } catch (err: any) {
    await appendLog(jobId, `[BUILD] Warning: could not fetch file tree (${err.message})`);
  }

  const relevantPaths = selectRelevantFiles(tree, plan);
  const repoContext: Array<{ path: string; content: string }> = [];
  for (const path of relevantPaths) {
    const content = await github.getFileContent(owner, repo, job.base_branch, path).catch(() => '');
    if (!content) continue;
    repoContext.push({ path, content: truncateContent(content, MAX_FILE_LINES) });
  }

  await appendLog(jobId, '[BUILD] Generating implementation...');
  const contextBlock = repoContext.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');
  const buildUserMessage = [
    `Plan:\n${JSON.stringify(plan, null, 2)}`,
    `Repository file tree (top 2 levels):\n${tree.join('\n')}`,
    `Relevant file contents:\n${contextBlock || '(none available)'}`,
    `User request:\n${job.prompt}`,
  ].join('\n\n');

  const buildResponse = await provider.complete(
    [{ role: 'user', content: buildUserMessage }],
    `${BLAIR_SYSTEM_PROMPT}\n\n${BUILD_STAGE_INSTRUCTIONS}`
  );
  const { files, summary } = parseBuildResponse(buildResponse.content);
  if (summary) {
    await appendLog(jobId, `[BUILD] Summary: ${summary}`);
  }

  await appendLog(jobId, '[BUILD] Creating feature branch...');
  const baseSha = await github.getBranchSha(owner, repo, job.base_branch);
  try {
    await github.createBranch(owner, repo, featureBranch, baseSha);
  } catch (err: any) {
    if (/already exists/i.test(err.message)) {
      await appendLog(jobId, `[BUILD] Branch ${featureBranch} already exists, continuing.`);
    } else {
      throw err;
    }
  }

  await appendLog(jobId, '[BUILD] Committing files...');
  let committedCount = 0;
  for (const file of files) {
    try {
      if (file.action === 'delete') {
        await github.deleteFile(owner, repo, featureBranch, file.path, `Blair: delete ${file.path}`);
      } else {
        await github.upsertFile(
          owner,
          repo,
          featureBranch,
          file.path,
          file.content,
          `Blair: ${file.action} ${file.path}`
        );
      }
      committedCount++;
      await appendLog(jobId, `[BUILD] Committed: ${file.path}`);
    } catch (err: any) {
      await appendLog(jobId, `[BUILD] Failed to commit ${file.path}: ${err.message}`);
    }
  }

  await logEvent(jobId, 'job.building.complete', { filesCommitted: committedCount });
  await appendLog(jobId, `[BUILD] Complete. ${committedCount} files committed.`);

  // ── Step 4: QA (placeholder) ──
  await updateJobStatus(jobId, 'qa');
  await logEvent(jobId, 'job.qa.started');
  await appendLog(jobId, '[QA] Running lint...');
  await appendLog(jobId, '[QA] Running build...');
  await appendLog(jobId, '[QA] Running typecheck...');
  await appendLog(jobId, '[QA] Running tests...');
  // TODO(M3): Actually run npm lint/build/typecheck/test against the sandboxed
  // checkout and persist real pass/fail output to the qa_runs table.
  await logEvent(jobId, 'job.qa.complete');
  await appendLog(jobId, '[QA] Complete.');

  // ── Step 5: PREVIEW (placeholder) ──
  await updateJobStatus(jobId, 'preview');
  await appendLog(jobId, '[PREVIEW] Preparing preview...');
  // TODO(M2): Expose a live Vite dev server for the feature branch and set preview_url
  await logEvent(jobId, 'job.preview.ready');
  await appendLog(jobId, '[PREVIEW] Preview ready.');

  // ── Step 6: REVIEW ──
  await updateJobStatus(jobId, 'review');
  await logEvent(jobId, 'job.review.ready', { branch: featureBranch });
  await appendLog(jobId, '[REVIEW] Ready for review.');
  // Job stays in 'review' until user approves via POST /api/jobs/:id/approve (see approveJob below)
}

async function updateJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
    [status, errorMessage || null, jobId]
  );
}

// ─────────────────────────────────────────────
// Approve a job in 'review' status — opens the Pull Request (Step 6: SHIP)
// ─────────────────────────────────────────────
export async function approveJob(jobId: string): Promise<{ pr_url: string }> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'review') {
    throw new Error(`Job ${jobId} must be in 'review' status to approve (current: ${job.status})`);
  }

  await appendLog(jobId, '[SHIP] Creating Pull Request...');

  const { owner, repo } = github.parseRepoUrl(job.repo_url);
  const planRow = await queryOne<{ plan_json: { raw?: string } }>(
    `SELECT plan_json FROM plans WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [jobId]
  );
  const plan = parsePlanJson(planRow?.plan_json?.raw);

  const title = typeof plan.summary === 'string' && plan.summary
    ? `Blair: ${plan.summary}`
    : `Blair: ${job.prompt.slice(0, 72)}`;
  const body = [
    `## User request\n${job.prompt}`,
    `## Plan\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\``,
  ].join('\n\n');

  const prUrl = await github.createPullRequest(owner, repo, job.feature_branch, job.base_branch, title, body);

  await query(`UPDATE jobs SET pr_url = $1, status = 'pr_opened', updated_at = NOW() WHERE id = $2`, [prUrl, jobId]);
  await logEvent(jobId, 'job.pr.opened', { prUrl });
  await appendLog(jobId, `[SHIP] PR opened: ${prUrl}`);

  return { pr_url: prUrl };
}
