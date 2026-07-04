import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { BlairAPI } from "@/api/blair";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, XCircle, Loader2, ExternalLink, GitPullRequest } from "lucide-react";

const TERMINAL_STATUSES = ["shipped", "pr_opened", "failed", "cancelled"];
const STATUS_ORDER = ["queued", "planning", "building", "qa", "preview", "review", "pr_opened", "shipped"];

const STATUS_BADGE = {
  queued: "QUEUED",
  planning: "RUNNING",
  building: "RUNNING",
  qa: "QA",
  preview: "REVIEW",
  review: "REVIEW",
  pr_opened: "DONE",
  shipped: "DONE",
  failed: "FAILED",
  cancelled: "FAILED",
};

const PHASES = [
  { label: "Plan", statuses: ["planning"] },
  { label: "Build", statuses: ["building"] },
  { label: "QA", statuses: ["qa"] },
  { label: "Preview", statuses: ["preview"] },
  { label: "Review", statuses: ["review"] },
  { label: "Ship", statuses: ["pr_opened", "shipped"] },
];

function phaseState(job, phase) {
  if (!job) return "pending";
  if (job.status === "failed" || job.status === "cancelled") return "pending";
  const currentIndex = STATUS_ORDER.indexOf(job.status);
  const phaseIndex = STATUS_ORDER.indexOf(phase.statuses[0]);
  const phaseLastIndex = STATUS_ORDER.indexOf(phase.statuses[phase.statuses.length - 1]);
  if (currentIndex > phaseLastIndex) return "complete";
  if (currentIndex >= phaseIndex && currentIndex <= phaseLastIndex) return "active";
  return "pending";
}

export default function Dashboard() {
  const location = useLocation();
  const isNewJob = location.search.includes("new=true");

  const [repoUrl, setRepoUrl] = useState("TFRS-Admin/TFRSupply-frontend");
  const [baseBranch, setBaseBranch] = useState("develop");
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("mock");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [activeJob, setActiveJob] = useState(null);
  const pollRef = useRef(null);
  const logRef = useRef(null);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollJob = useCallback((id) => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const job = await BlairAPI.getJob(id);
        setActiveJob(job);
        if (TERMINAL_STATUSES.includes(job.status)) {
          clearPoll();
        }
      } catch {
        clearPoll();
      }
    }, 2000);
  }, []);

  useEffect(() => {
    if (isNewJob) {
      setActiveJob(null);
      return;
    }
    // Load the most recent job, if any, so Dashboard isn't blank on load.
    (async () => {
      try {
        const jobs = await BlairAPI.listJobs();
        if (jobs && jobs.length > 0) {
          setActiveJob(jobs[0]);
          if (!TERMINAL_STATUSES.includes(jobs[0].status)) {
            pollJob(jobs[0].id);
          }
        }
      } catch {
        // Server may be offline — leave the panel empty.
      }
    })();
    return clearPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewJob]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [activeJob?.job_logs]);

  const runBlair = async () => {
    if (!repoUrl.trim() || !prompt.trim() || prompt.trim().length < 10) {
      setSubmitError("Repository and a prompt of at least 10 characters are required.");
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { id } = await BlairAPI.submitJob({ repoUrl, baseBranch, prompt, provider });
      const job = await BlairAPI.getJob(id);
      setActiveJob(job);
      pollJob(id);
    } catch (err) {
      setSubmitError(err.message);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="p-8 grid lg:grid-cols-2 gap-8">
      {/* Consultation Panel */}
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold uppercase tracking-wide text-tfrs-text">
            Job Submission
          </h1>
          <p className="text-sm text-tfrs-muted mt-1">
            Define the repo, the branch, and what you want Blair to build.
          </p>
        </div>

        <div className="bg-tfrs-surface border border-tfrs-border p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-tfrs-muted text-xs font-mono uppercase">Repository</Label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="TFRS-Admin/TFRSupply-frontend"
              className="bg-tfrs-bg border-tfrs-border text-tfrs-text font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-tfrs-muted text-xs font-mono uppercase">Base Branch</Label>
            <Input
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="develop"
              className="bg-tfrs-bg border-tfrs-border text-tfrs-text font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-tfrs-muted text-xs font-mono uppercase">Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want Blair to build..."
              rows={8}
              className="bg-tfrs-bg border-tfrs-border text-tfrs-text font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-tfrs-muted text-xs font-mono uppercase">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="bg-tfrs-bg border-tfrs-border text-tfrs-text font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Mock</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {submitError && (
            <p className="text-sm text-tfrs-red font-mono">{submitError}</p>
          )}

          <Button
            onClick={runBlair}
            disabled={isSubmitting}
            className="w-full bg-tfrs-red hover:bg-tfrs-red/90 text-tfrs-text font-mono uppercase tracking-wide py-6 rounded-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Run Blair"
            )}
          </Button>
        </div>
      </div>

      {/* Status Panel */}
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold uppercase tracking-wide text-tfrs-text">
            Job Status
          </h1>
          <p className="text-sm text-tfrs-muted mt-1">Live pipeline progress.</p>
        </div>

        {!activeJob ? (
          <div className="bg-tfrs-surface border border-tfrs-border p-12 text-center text-tfrs-muted font-mono text-sm">
            No active job. Submit a job to see live status here.
          </div>
        ) : (
          <div className="bg-tfrs-surface border border-tfrs-border p-6 space-y-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-tfrs-muted truncate">{activeJob.id}</span>
              <Badge className="bg-tfrs-red text-tfrs-text border-none rounded-none font-mono">
                {STATUS_BADGE[activeJob.status] || activeJob.status?.toUpperCase()}
              </Badge>
            </div>

            {/* Phase Timeline */}
            <div className="space-y-3">
              {PHASES.map((phase) => {
                const state = phaseState(activeJob, phase);
                return (
                  <div key={phase.label} className="flex items-center gap-3">
                    {state === "complete" && <CheckCircle2 className="w-4 h-4 text-tfrs-gold" />}
                    {state === "active" && <Loader2 className="w-4 h-4 text-tfrs-red animate-spin" />}
                    {state === "pending" && <Circle className="w-4 h-4 text-tfrs-muted" />}
                    <span className={`text-sm font-mono uppercase ${state === "pending" ? "text-tfrs-muted" : "text-tfrs-text"}`}>
                      {phase.label}
                    </span>
                  </div>
                );
              })}
              {activeJob.status === "failed" && (
                <div className="flex items-center gap-3">
                  <XCircle className="w-4 h-4 text-tfrs-red" />
                  <span className="text-sm font-mono uppercase text-tfrs-red">
                    Failed{activeJob.error_message ? `: ${activeJob.error_message}` : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Output Log */}
            <div>
              <Label className="text-tfrs-muted text-xs font-mono uppercase mb-2 block">Output Log</Label>
              <div
                ref={logRef}
                className="bg-black/40 border border-tfrs-border p-3 h-56 overflow-y-auto font-mono text-xs text-tfrs-text whitespace-pre-wrap"
              >
                {activeJob.job_logs || "Waiting for output..."}
              </div>
            </div>

            <div className="flex gap-3">
              {activeJob.preview_url && (
                <a href={activeJob.preview_url} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="outline" className="w-full border-tfrs-border text-tfrs-text font-mono uppercase rounded-none">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                </a>
              )}
              {activeJob.pr_url && (
                <a href={activeJob.pr_url} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="outline" className="w-full border-tfrs-border text-tfrs-text font-mono uppercase rounded-none">
                    <GitPullRequest className="w-4 h-4 mr-2" />
                    Pull Request
                  </Button>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
