// BlairAPI — thin client over the Blair server job/provider gateway.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// The server requires repoUrl to be a full URL. The Dashboard accepts the
// shorthand "owner/repo" form, so normalize it here before submission.
function normalizeRepoUrl(repo) {
  const trimmed = (repo || '').trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://github.com/${trimmed.replace(/^\/+/, '')}`;
}

async function request(path, options = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.error?.message || `Request failed: ${res.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return body;
}

export const BlairAPI = {
  // Submits a new job. Returns { id }.
  async submitJob({ repoUrl, baseBranch, prompt, provider }) {
    const body = await request('/api/generations', {
      method: 'POST',
      body: JSON.stringify({ repoUrl: normalizeRepoUrl(repoUrl), baseBranch, prompt, provider }),
    });
    return body.data;
  },

  // Fetches a single job by id, including job_logs, status, preview_url, pr_url.
  async getJob(id) {
    const body = await request(`/api/jobs/${id}`);
    return body.data;
  },

  // Fetches the live preview status for a job: { previewUrl, status, lastUpdated }.
  async getPreview(id) {
    const body = await request(`/api/jobs/${id}/preview`);
    return body.data;
  },

  // Lists recent jobs.
  async listJobs() {
    const body = await request('/api/jobs');
    return body.data;
  },

  // Synchronous consultation reply — does not create a job.
  async chat({ prompt, history, provider }) {
    const body = await request('/api/generations/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt, history, provider }),
    });
    return body.data.content;
  },

  // Server health/provider status.
  async getHealth() {
    return request('/api/health');
  },

  // Lists all repos accessible to the server's GITHUB_TOKEN.
  async listRepos() {
    const body = await request('/api/github/repos');
    return body.data;
  },

  // Lists branches for a given owner/repo.
  async listBranches(owner, repo) {
    const body = await request(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`);
    return body.data;
  },
};

export default BlairAPI;
