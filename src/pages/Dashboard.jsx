import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { BlairAPI } from "@/api/blair";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  ExternalLink,
  GitPullRequest,
  Lock,
  GitBranch,
  ChevronsUpDown,
} from "lucide-react";

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

  const [selectedRepo, setSelectedRepo] = useState(null); // { full_name, name, private, default_branch }
  const [selectedBranch, setSelectedBranch] = useState("");
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [reposError, setReposError] = useState(null);
  const [branchesError, setBranchesError] = useState(null);
  const [repoPopoverOpen, setRepoPopoverOpen] = useState(false);

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

  // Load the repo list once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReposLoading(true);
      setReposError(null);
      try {
        const data = await BlairAPI.listRepos();
        if (!cancelled) setRepos(data);
      } catch (err) {
        if (!cancelled) setReposError(err.message);
      } finally {
        if (!cancelled) setReposLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load branches whenever the selected repo changes, auto-selecting the default branch.
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setSelectedBranch("");
      return;
    }
    let cancelled = false;
    setSelectedBranch("");
    setBranches([]);
    setBranchesError(null);
    setBranchesLoading(true);
    (async () => {
      try {
        const [owner, repo] = selectedRepo.full_name.split("/");
        const data = await BlairAPI.listBranches(owner, repo);
        if (cancelled) return;
        setBranches(data);
        const defaultBranch = data.find((b) => b.name === selectedRepo.default_branch);
        setSelectedBranch(defaultBranch ? defaultBranch.name : data[0]?.name || "");
      } catch (err) {
        if (!cancelled) setBranchesError(err.message);
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRepo]);

  const canSubmit =
    !!selectedRepo && !!selectedBranch && !!prompt.trim() && prompt.trim().length >= 10 && !isSubmitting;

  const runBlair = async () => {
    if (!canSubmit) {
      setSubmitError("Repository, branch, and a prompt of at least 10 characters are required.");
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { id } = await BlairAPI.submitJob({
        repoUrl: `https://github.com/${selectedRepo.full_name}`,
        baseBranch: selectedBranch,
        prompt,
        provider,
      });
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
            <Label className="text-tfrs-muted text-xs font-mono uppercase flex items-center gap-2">
              Repository
              {reposLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            </Label>
            <Popover open={repoPopoverOpen} onOpenChange={setRepoPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={repoPopoverOpen}
                  disabled={reposLoading || !!reposError}
                  className={`w-full justify-between bg-tfrs-bg border-tfrs-border font-mono rounded-none hover:bg-tfrs-bg ${
                    selectedRepo ? "text-tfrs-gold hover:text-tfrs-gold" : "text-tfrs-muted hover:text-tfrs-muted"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {selectedRepo ? (
                      <>
                        {selectedRepo.private && <Lock className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{selectedRepo.full_name}</span>
                      </>
                    ) : reposLoading ? (
                      "Loading repositories..."
                    ) : (
                      "Select repository..."
                    )}
                  </span>
                  <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-tfrs-bg border-tfrs-border rounded-none">
                <Command className="bg-tfrs-bg rounded-none">
                  <CommandInput placeholder="Search repositories..." className="font-mono text-tfrs-text" />
                  <CommandList>
                    <CommandEmpty className="py-4 text-center font-mono text-sm text-tfrs-muted">
                      No repositories found.
                    </CommandEmpty>
                    <CommandGroup>
                      {repos.map((r) => (
                        <CommandItem
                          key={r.full_name}
                          value={r.full_name}
                          onSelect={() => {
                            setSelectedRepo(r);
                            setRepoPopoverOpen(false);
                          }}
                          className="font-mono text-sm text-tfrs-text rounded-none data-[selected=true]:bg-tfrs-surface data-[selected=true]:text-tfrs-gold"
                        >
                          {r.private && <Lock className="w-3 h-3 mr-2 shrink-0" />}
                          {r.full_name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {reposError && (
              <p className="text-xs font-mono text-tfrs-red">Failed to load repos — check GITHUB_TOKEN</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-tfrs-muted text-xs font-mono uppercase flex items-center gap-2">
              Base Branch
              {branchesLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            </Label>
            <Select
              value={selectedBranch}
              onValueChange={setSelectedBranch}
              disabled={!selectedRepo || branchesLoading || !!branchesError}
            >
              <SelectTrigger
                className={`bg-tfrs-bg border-tfrs-border font-mono rounded-none ${
                  selectedBranch ? "text-tfrs-gold" : "text-tfrs-muted"
                }`}
              >
                <SelectValue
                  placeholder={
                    !selectedRepo
                      ? "Select a repository first"
                      : branchesLoading
                      ? "Loading branches..."
                      : "Select branch..."
                  }
                />
              </SelectTrigger>
              <SelectContent className="bg-tfrs-bg border-tfrs-border rounded-none">
                {branches.map((b) => (
                  <SelectItem
                    key={b.name}
                    value={b.name}
                    className="font-mono text-sm text-tfrs-text rounded-none focus:bg-tfrs-surface focus:text-tfrs-gold"
                  >
                    <span className="flex items-center gap-2">
                      <GitBranch className="w-3 h-3" />
                      {b.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {branchesError && (
              <p className="text-xs font-mono text-tfrs-red">Failed to load branches — {branchesError}</p>
            )}
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
            disabled={!canSubmit}
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
