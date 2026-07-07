import { query, queryOne } from '../../db/client';
import { getProvider, Provider } from '../providers';
import { logEvent } from '../audit';
import { BLAIR_SYSTEM_PROMPT } from '../blairPrompt';
import * as github from '../github';
import { config } from '../../config';
import { v4 as uuidv4 } from 'uuid';
import { runVerification, listQaRuns, VerificationResult } from '../verification/verify';
import type { CheckName } from '../verification/checks';

const CHECK_NAMES: CheckName[] = ['lint', 'build', 'typecheck', 'test'];

// M4 slice 3 (docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md section 6): bounded
// repair loop. A `failed` check gets up to this many repair attempts before the
// job gives up; an `errored` check never triggers a repair (see runJobPipeline).
const MAX_REPAIR_ATTEMPTS = 2;

export interface JobInput {
  repoUrl: string;
  baseBranch?: string;
  prompt: string;
  provider?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
}

const MAX_CONTEXT_FILES = 15;
const MAX_FILE_LINES = 200;
const MAX_OUTPUT_FILES = 10;

const PREVIEW_POLL_INTERVAL_MS = 5000;
const PREVIEW_POLL_TIMEOUT_MS = 120000; // 2 minutes

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

// M4 slice 3: repair prompt. Deliberately asks for a minimal fix, not a
// rewrite — the repair loop is bounded (MAX_REPAIR_ATTEMPTS), so each attempt
// should converge toward passing rather than re-implementing the feature.
const REPAIR_STAGE_INSTRUCTIONS = `
A previous attempt to implement this feature failed verification. You must fix the
reported failure(s) without breaking anything else.

You will receive:
1. The original plan (JSON)
2. The files generated so far
3. Which check(s) failed (lint/build/typecheck/test) and their exact failure output

You must respond with ONLY valid JSON in this exact format:
{
  "files": [
    { "path": "src/pages/Example.jsx", "content": "...full file content...", "action": "update" }
  ],
  "summary": "One sentence describing the fix"
}

Rules:
- Return the minimal fix only — do not rewrite files that aren't implicated by the failure output
- Always write complete file contents for any file you do include, never partial diffs
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

// Railway subdomains only allow lowercase alphanumerics and hyphens, so a
// branch name like "feature/blair-a1b2c3d4" becomes "feature-blair-a1b2c3d4".
function sanitizeBranchForRailway(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds the expected Railway preview deploy URL for a feature branch, per
 * Railway's built-in preview environment naming convention:
 *   https://<branch-name>-<project-id>.railway.app
 * Returns null if RAILWAY_PROJECT_ID isn't configured, in which case preview
 * polling is skipped entirely (see runJobPipeline's PREVIEW step).
 */
export function buildPreviewUrl(branch: string): string | null {
  const projectId = config.railway.projectId;
  if (!projectId) return null;
  return `https://${sanitizeBranchForRailway(branch)}-${projectId}.railway.app`;
}

export interface PollPreviewOptions {
  intervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Polls a Railway preview URL until it responds 200 OK, or gives up after
 * timeoutMs. Network errors and non-200 responses (the deploy is still
 * building) are treated the same — keep polling until the deadline.
 * fetchImpl/sleepImpl are injectable so tests can run this without real
 * network calls or real delays.
 */
export async function pollPreviewReady(url: string, opts: PollPreviewOptions = {}): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? PREVIEW_POLL_INTERVAL_MS;
  const timeoutMs = opts.timeoutMs ?? PREVIEW_POLL_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleepImpl = opts.sleepImpl ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetchImpl(url, { method: 'GET' });
      if (res.status === 200) return true;
    } catch {
      // Not reachable yet (DNS not propagated, deploy still building) — keep polling.
    }
    if (attempt < maxAttempts - 1) await sleepImpl(intervalMs);
  }
  return false;
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

interface GenerateAndCommitResult {
  files: GeneratedFile[];
  summary: string;
  committedCount: number;
}

/**
 * Shared by BUILD and REPAIR: calls the provider, parses its files[] response,
 * and commits each file to the feature branch via the GitHub API. Extracted
 * so slice 3's repair attempts reuse the exact same generation/commit flow as
 * the initial build rather than duplicating it (docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md
 * section 2, "reuse the existing BUILD provider flow where practical").
 */
async function generateAndCommitFiles(params: {
  jobId: string;
  provider: Provider;
  owner: string;
  repo: string;
  featureBranch: string;
  systemPrompt: string;
  userMessage: string;
  logPrefix: string;
}): Promise<GenerateAndCommitResult> {
  const { jobId, provider, owner, repo, featureBranch, systemPrompt, userMessage, logPrefix } = params;

  await appendLog(jobId, `${logPrefix} Generating implementation...`);
  const response = await provider.complete([{ role: 'user', content: userMessage }], systemPrompt);
  const { files, summary } = parseBuildResponse(response.content);
  if (summary) {
    await appendLog(jobId, `${logPrefix} Summary: ${summary}`);
  }

  await appendLog(jobId, `${logPrefix} Committing files...`);
  let committedCount = 0;
  for (const file of files) {
    try {
      if (file.action === 'delete') {
        await github.deleteFile(owner, repo, featureBranch, file.path, `Blair: delete ${file.path}`);
      } else {
        await github.upsertFile(owner, repo, featureBranch, file.path, file.content, `Blair: ${file.action} ${file.path}`);
      }
      committedCount++;
      await appendLog(jobId, `${logPrefix} Committed: ${file.path}`);
    } catch (err: any) {
      await appendLog(jobId, `${logPrefix} Failed to commit ${file.path}: ${err.message}`);
    }
  }

  return { files, summary, committedCount };
}

/** Merges a new batch of generated files into the accumulated by-path map (later commits win on the same path). */
export function mergeGeneratedFiles(existing: Map<string, GeneratedFile>, incoming: GeneratedFile[]): Map<string, GeneratedFile> {
  const merged = new Map(existing);
  for (const file of incoming) merged.set(file.path, file);
  return merged;
}

/**
 * Builds the REPAIR step's provider prompt: the original plan, every file
 * generated so far (build + any prior repairs), and the exact output of
 * every check that actually failed (not errored — those never reach here).
 */
export function buildRepairUserMessage(
  plan: Record<string, any>,
  generatedFiles: GeneratedFile[],
  failedChecks: Array<{ name: CheckName; output: string }>
): string {
  const filesBlock = generatedFiles
    .map((f) => `--- ${f.path} (${f.action}) ---\n${truncateContent(f.content, MAX_FILE_LINES)}`)
    .join('\n\n');
  const failuresBlock = failedChecks
    .map((f) => `### ${f.name}\n${truncateContent(f.output, MAX_FILE_LINES)}`)
    .join('\n\n');

  return [
    `Plan:\n${JSON.stringify(plan, null, 2)}`,
    `Files generated so far:\n${filesBlock || '(none)'}`,
    `Failing check(s):\n${failuresBlock}`,
  ].join('\n\n');
}

/** Runs verification once, logs each check's outcome, and records the qa.complete audit event. Shared by the initial QA pass and every re-verification after a repair. */
async function runVerificationStep(
  jobId: string,
  owner: string,
  repo: string,
  branch: string,
  attempt: number
): Promise<VerificationResult> {
  await logEvent(jobId, 'job.qa.started', { attempt });
  await appendLog(jobId, '[QA] Materializing workspace and checking for available scripts...');

  const verification = await runVerification({ jobId, owner, repo, branch });
  const { checks } = verification;

  for (const name of CHECK_NAMES) {
    const result = checks[name];
    if (result.outcome === 'skipped') {
      await appendLog(jobId, `[QA] No ${name} script found in package.json — skipped.`);
    } else if (result.outcome === 'passed') {
      await appendLog(jobId, `[QA] ${name} passed.`);
    } else if (result.outcome === 'failed') {
      await appendLog(jobId, `[QA] ${name} failed.`);
    } else {
      await appendLog(jobId, `[QA] ${name} could not run: ${result.output.slice(0, 500)}`);
    }
  }

  await logEvent(jobId, 'job.qa.complete', {
    attempt,
    ok: verification.ok,
    qaRunId: verification.qaRun.id,
    outcomes: Object.fromEntries(CHECK_NAMES.map((name) => [name, checks[name].outcome])),
  });

  return verification;
}

export type RepairDecision =
  | { action: 'proceed' }
  | { action: 'repair'; attemptNumber: number; failedChecks: CheckName[] }
  | { action: 'fail'; reason: 'errored' | 'repair_budget_exhausted' | 'no_failed_check_found'; detail: string };

/**
 * Pure decision function for the M4 slice 3 repair loop — exported so its
 * behavior is directly unit-testable without needing a live DB/GitHub/
 * provider harness around the full `runJobPipeline` (which, like the rest of
 * this file's PLAN/BUILD/PREVIEW/REVIEW steps, is not otherwise unit tested;
 * only extracted pure logic like this and `buildPreviewUrl` is).
 *
 * `qaRunsCountForJob` is the number of qa_runs rows already persisted for
 * this job, including the one just written for `verification` — i.e. 1 means
 * "only the initial attempt has run", 2 means "one repair has already been
 * tried", etc. This is how repair attempts are counted (per
 * docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md section 6): no new column,
 * just COUNT(*) WHERE job_id = X.
 */
export function decideRepairAction(
  verification: VerificationResult,
  qaRunsCountForJob: number,
  maxRepairAttempts: number
): RepairDecision {
  if (verification.ok) return { action: 'proceed' };

  // An errored check is an infrastructure problem (timeout, install failure,
  // workspace materialization failure) — never evidence the generated code
  // is wrong, so it's never repaired, regardless of what else did or didn't fail.
  const erroredCheck = CHECK_NAMES.find((name) => verification.checks[name].outcome === 'errored');
  if (erroredCheck) {
    return { action: 'fail', reason: 'errored', detail: erroredCheck };
  }

  const failedChecks = CHECK_NAMES.filter((name) => verification.checks[name].outcome === 'failed');
  if (failedChecks.length === 0) {
    // Defensive: !verification.ok with nothing failed or errored should be unreachable
    // (isOk() in verify.ts only returns false when something failed or errored).
    return { action: 'fail', reason: 'no_failed_check_found', detail: '' };
  }

  const repairsUsed = qaRunsCountForJob - 1; // the first row is the initial attempt, not a repair
  if (repairsUsed >= maxRepairAttempts) {
    return { action: 'fail', reason: 'repair_budget_exhausted', detail: failedChecks.join(', ') };
  }

  return { action: 'repair', attemptNumber: repairsUsed + 1, failedChecks };
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

  // Railway auto-deploys a preview environment for the new branch as soon as
  // it exists on GitHub. Capture the expected preview URL now so the PREVIEW
  // step can record it on the job right away, without waiting for QA/deploy.
  const previewUrl = buildPreviewUrl(featureBranch);
  if (previewUrl) {
    await appendLog(jobId, `[BUILD] Expected Railway preview URL: ${previewUrl}`);
  } else {
    await appendLog(jobId, '[BUILD] RAILWAY_PROJECT_ID not configured — skipping preview URL.');
  }

  const buildResult = await generateAndCommitFiles({
    jobId,
    provider,
    owner,
    repo,
    featureBranch,
    systemPrompt: `${BLAIR_SYSTEM_PROMPT}\n\n${BUILD_STAGE_INSTRUCTIONS}`,
    userMessage: buildUserMessage,
    logPrefix: '[BUILD]',
  });
  let generatedFiles = mergeGeneratedFiles(new Map(), buildResult.files);

  await logEvent(jobId, 'job.building.complete', { filesCommitted: buildResult.committedCount });
  await appendLog(jobId, `[BUILD] Complete. ${buildResult.committedCount} files committed.`);

  // ── Step 4: QA (+ bounded repair loop, M4 slice 3) ──
  // Runs every check the target repo defines (lint/build/typecheck/test)
  // against a materialized copy of the feature branch and persists one real
  // qa_runs row per attempt. A `failed` check gets up to MAX_REPAIR_ATTEMPTS
  // repair attempts (re-invoking the BUILD provider flow with the exact
  // failure output, per docs/engineering/M4_VERIFICATION_ENGINE_PLAN.md
  // section 6) before the job gives up. An `errored` check is never
  // repaired — it's an infrastructure problem, not evidence the generated
  // code is wrong — and fails the job immediately. A `skipped` check never
  // blocks progression.
  await updateJobStatus(jobId, 'qa');

  let verification = await runVerificationStep(jobId, owner, repo, featureBranch, 1);

  // Structural safety net, independent of decideRepairAction's own qa_runs-based
  // cap: even if that counting were ever wrong, this loop still cannot run
  // forever. Bounded one notch more generously than the real cap
  // (MAX_REPAIR_ATTEMPTS) so decideRepairAction's 'repair_budget_exhausted'
  // check is always what actually stops it, not this outer bound.
  for (let loopIteration = 0; loopIteration <= MAX_REPAIR_ATTEMPTS; loopIteration++) {
    const qaRunsSoFar = await listQaRuns(jobId);
    const decision = decideRepairAction(verification, qaRunsSoFar.length, MAX_REPAIR_ATTEMPTS);

    if (decision.action === 'proceed') break;

    if (decision.action === 'fail') {
      await logEvent(jobId, 'job.qa.failed', { reason: decision.reason, detail: decision.detail });
      if (decision.reason === 'errored') {
        await appendLog(jobId, `[QA] ${decision.detail} errored — not repairable, stopping before PREVIEW.`);
        throw new Error(`Verification errored on ${decision.detail}: an infrastructure problem, not repairable. See qa_runs for details.`);
      }
      if (decision.reason === 'repair_budget_exhausted') {
        await appendLog(jobId, `[QA] ${decision.detail} still failing after ${MAX_REPAIR_ATTEMPTS} repair attempts — stopping before PREVIEW.`);
        throw new Error(`Verification failed: ${decision.detail} did not pass after ${MAX_REPAIR_ATTEMPTS} repair attempts. See qa_runs for details.`);
      }
      throw new Error('Verification failed but no check was reported as failed or errored. See qa_runs for details.');
    }

    // decision.action === 'repair'
    const { attemptNumber, failedChecks } = decision;
    await logEvent(jobId, 'job.repair.started', { attempt: attemptNumber, maxAttempts: MAX_REPAIR_ATTEMPTS, checks: failedChecks });
    await appendLog(jobId, `[REPAIR] Attempt ${attemptNumber}/${MAX_REPAIR_ATTEMPTS}: fixing ${failedChecks.join(', ')}...`);

    const repairUserMessage = buildRepairUserMessage(
      plan,
      Array.from(generatedFiles.values()),
      failedChecks.map((name) => ({ name, output: verification.checks[name].output }))
    );
    const repairResult = await generateAndCommitFiles({
      jobId,
      provider,
      owner,
      repo,
      featureBranch,
      systemPrompt: `${BLAIR_SYSTEM_PROMPT}\n\n${REPAIR_STAGE_INSTRUCTIONS}`,
      userMessage: repairUserMessage,
      logPrefix: '[REPAIR]',
    });
    generatedFiles = mergeGeneratedFiles(generatedFiles, repairResult.files);

    await logEvent(jobId, 'job.repair.complete', { attempt: attemptNumber, filesCommitted: repairResult.committedCount });
    await appendLog(jobId, `[REPAIR] Attempt ${attemptNumber} complete. Re-running verification...`);

    verification = await runVerificationStep(jobId, owner, repo, featureBranch, attemptNumber + 1);
    // Loop back to the top: the next iteration re-evaluates decideRepairAction
    // against this fresh verification result before attempting anything else.
  }

  await appendLog(jobId, '[QA] Complete.');

  // ── Step 5: PREVIEW ──
  // Sets the expected preview_url immediately and moves on — it no longer
  // blocks the pipeline for up to PREVIEW_POLL_TIMEOUT_MS waiting for Railway
  // to actually come up. Actual readiness is confirmed by a detached
  // background poll (not awaited here) and surfaced to the frontend on
  // demand via GET /api/jobs/:id/preview, which the frontend already polls
  // independently of job status.
  await updateJobStatus(jobId, 'preview');
  await appendLog(jobId, '[PREVIEW] Preparing preview...');

  if (previewUrl) {
    await query(
      `UPDATE jobs SET preview_url = $1, updated_at = NOW() WHERE id = $2`,
      [previewUrl, jobId]
    );
    await logEvent(jobId, 'job.preview.expected', { previewUrl });
    await appendLog(jobId, `[PREVIEW] Preview URL set: ${previewUrl}. Confirming readiness in the background.`);

    pollPreviewReady(previewUrl)
      .then(async (ready) => {
        if (ready) {
          await query(`UPDATE jobs SET preview_ready_at = NOW(), updated_at = NOW() WHERE id = $1`, [jobId]);
          await logEvent(jobId, 'job.preview.ready', { previewUrl });
          await appendLog(jobId, `[PREVIEW] Preview confirmed ready: ${previewUrl}`);
        } else {
          await logEvent(jobId, 'job.preview.timeout', { previewUrl });
          await appendLog(jobId, '[PREVIEW] Timed out waiting for the preview to come up after 2 minutes.');
        }
      })
      .catch((err: any) => {
        console.error(`[orchestrator] Background preview poll failed for job ${jobId}:`, err.message);
      });
  } else {
    await logEvent(jobId, 'job.preview.skipped');
    await appendLog(jobId, '[PREVIEW] Skipped — no Railway project configured.');
  }

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
