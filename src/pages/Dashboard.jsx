import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BlairAPI } from "@/api/blair";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import ChatInterface from "@/components/dashboard/ChatInterface";
import ChatInput from "@/components/dashboard/ChatInput";
import RightPanel from "@/components/dashboard/RightPanel";

const TERMINAL_STATUSES = ["shipped", "pr_opened", "failed", "cancelled"];

const STATUS_LABEL = {
  queued: "Queued",
  planning: "Planning",
  building: "Building",
  qa: "Running QA",
  preview: "Preparing preview",
  review: "Awaiting review",
  pr_opened: "Pull request opened",
  shipped: "Shipped",
  failed: "Failed",
  cancelled: "Cancelled",
};

function statusMessageFor(job) {
  const label = STATUS_LABEL[job.status] || job.status;
  let text = `**Status:** ${label}`;
  if (job.job_logs) {
    text += `\n\n\`\`\`\n${job.job_logs.slice(-1500)}\n\`\`\``;
  }
  return text;
}

function finalMessageFor(job) {
  if (job.status === "failed" || job.status === "cancelled") {
    return `**Status:** Failed${job.error_message ? ` — ${job.error_message}` : ""}`;
  }
  let text = "**Status:** Done — your changes are ready.";
  if (job.pr_url) text += `\n\n[View Pull Request](${job.pr_url})`;
  return text;
}

function repoFullNameFromUrl(repoUrl) {
  try {
    const url = new URL(repoUrl);
    return url.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
  } catch {
    return null;
  }
}

function useResponsiveTier() {
  const getTier = () => {
    if (typeof window === "undefined") return "desktop";
    const w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1200) return "tablet";
    return "desktop";
  };
  const [tier, setTier] = useState(getTier);
  useEffect(() => {
    const onResize = () => setTier(getTier());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return tier;
}

export default function Dashboard() {
  const location = useLocation();
  const isNewJob = location.search.includes("new=true");
  const tier = useResponsiveTier();
  const isMobile = tier === "mobile";

  const [selectedRepo, setSelectedRepo] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState(null);

  const [promptValue, setPromptValue] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [provider, setProvider] = useState("mock");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [messages, setMessages] = useState([]);

  const [activeJob, setActiveJob] = useState(null);
  const pollRef = useRef(null);
  const nextMessageIdRef = useRef(0);
  const prevRepoRef = useRef(null);

  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewSource, setPreviewSource] = useState("repo");
  const [rightPanelTab, setRightPanelTab] = useState("files");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [repoOwner, repoName] = selectedRepo ? selectedRepo.full_name.split("/") : [null, null];

  const newMessageId = (prefix) => {
    nextMessageIdRef.current += 1;
    return `${prefix}-${nextMessageIdRef.current}`;
  };

  const fetchPreview = useCallback(async (jobId) => {
    if (!jobId) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await BlairAPI.getPreview(jobId);
      setPreviewData(data);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollJob = useCallback(
    (id, msgId) => {
      clearPoll();
      pollRef.current = setInterval(async () => {
        try {
          const job = await BlairAPI.getJob(id);
          setActiveJob(job);
          fetchPreview(id);
          const terminal = TERMINAL_STATUSES.includes(job.status);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: terminal ? finalMessageFor(job) : statusMessageFor(job), isStreaming: !terminal }
                : m
            )
          );
          if (terminal) clearPoll();
        } catch {
          clearPoll();
        }
      }, 2000);
    },
    [fetchPreview]
  );

  // Restore the most recent job on load so the Dashboard isn't blank, unless
  // the user explicitly asked for a fresh one via "New Job" (?new=true).
  useEffect(() => {
    if (isNewJob) {
      setActiveJob(null);
      setPreviewData(null);
      setPreviewError(null);
      setMessages([]);
      return;
    }
    (async () => {
      try {
        const jobs = await BlairAPI.listJobs();
        if (jobs && jobs.length > 0) {
          const job = jobs[0];
          setActiveJob(job);
          fetchPreview(job.id);
          const terminal = TERMINAL_STATUSES.includes(job.status);
          const msgId = newMessageId("assistant");
          setMessages([
            { id: msgId, role: "assistant", content: terminal ? finalMessageFor(job) : statusMessageFor(job), isStreaming: !terminal },
          ]);
          if (!terminal) pollJob(job.id, msgId);
        }
      } catch {
        // Server may be offline — leave the chat empty.
      }
    })();
    return clearPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewJob]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReposLoading(true);
      try {
        const data = await BlairAPI.listRepos();
        if (!cancelled) setRepos(data);
      } catch {
        // Repo list failure surfaces via the Sidebar's own empty state.
      } finally {
        if (!cancelled) setReposLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once repos are loaded, try to preselect the repo behind the restored job.
  useEffect(() => {
    if (selectedRepo || !activeJob || repos.length === 0) return;
    const fullName = repoFullNameFromUrl(activeJob.repo_url);
    const match = repos.find((r) => r.full_name === fullName);
    if (match) setSelectedRepo(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, activeJob]);

  // Load branches whenever the selected repo changes. Switching to a
  // *different* repo starts a fresh conversation; the first assignment
  // (manual pick, or restoring the previous job's repo) does not.
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setSelectedBranch("");
      return;
    }
    const isRepoSwitch = prevRepoRef.current && prevRepoRef.current !== selectedRepo.full_name;
    prevRepoRef.current = selectedRepo.full_name;
    if (isRepoSwitch) {
      clearPoll();
      setMessages([]);
      setActiveJob(null);
      setPreviewData(null);
      setPreviewError(null);
      setSubmitError(null);
      setRightPanelTab("files");
      setPreviewSource("repo");
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

  const jobRunning = !!activeJob && !TERMINAL_STATUSES.includes(activeJob.status);
  const inputDisabled = isSubmitting || jobRunning || !selectedRepo || !selectedBranch;

  const placeholder = !selectedRepo
    ? "Select a repository to get started..."
    : jobRunning
    ? "Blair is working on your last request..."
    : "Describe what you want to build...";

  const handleSend = async () => {
    const text = promptValue.trim();
    if (!text) return;
    if (!selectedRepo || !selectedBranch) {
      setSubmitError("Select a repository and branch first.");
      return;
    }
    if (text.length < 10) {
      setSubmitError("Describe what you want in at least 10 characters.");
      return;
    }
    setSubmitError(null);

    const attachmentNote = attachments.length ? `\n\n_Attached: ${attachments.map((f) => f.name).join(", ")}_` : "";
    setMessages((prev) => [...prev, { id: newMessageId("user"), role: "user", content: text + attachmentNote }]);
    setPromptValue("");
    setAttachments([]);
    setIsSubmitting(true);
    setIsThinking(true);

    try {
      const { id } = await BlairAPI.submitJob({
        repoUrl: `https://github.com/${selectedRepo.full_name}`,
        baseBranch: selectedBranch,
        prompt: text,
        provider,
      });
      const job = await BlairAPI.getJob(id);
      setActiveJob(job);
      setPreviewData(null);
      setPreviewSource("job");
      setRightPanelTab("preview");
      fetchPreview(id);

      const msgId = newMessageId("assistant");
      setMessages((prev) => [...prev, { id: msgId, role: "assistant", content: statusMessageFor(job), isStreaming: true }]);
      pollJob(id, msgId);
    } catch (err) {
      setSubmitError(err.message);
      setMessages((prev) => [
        ...prev,
        { id: newMessageId("assistant"), role: "assistant", content: `Sorry — I couldn't start that job: ${err.message}` },
      ]);
    } finally {
      setIsSubmitting(false);
      setIsThinking(false);
    }
  };

  const handleTopTabChange = (key) => {
    if (key === "dashboard") {
      setMobilePanelOpen(false);
    } else {
      setRightPanelTab(key);
      if (isMobile) setMobilePanelOpen(true);
    }
  };

  const chatColumn = (
    <div className="flex flex-col h-full min-h-0 bg-blair-bg">
      <ChatInterface messages={messages} isThinking={isThinking} />
      {submitError && <p className="px-4 pb-1 text-xs text-red-500 shrink-0">{submitError}</p>}
      <div className="flex items-center gap-2 px-4 pt-2 shrink-0">
        <span className="text-[11px] text-blair-muted">Provider</span>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mock">Mock</SelectItem>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ChatInput
        value={promptValue}
        onChange={setPromptValue}
        onSend={handleSend}
        disabled={inputDisabled}
        placeholder={placeholder}
        attachments={attachments}
        onAttach={(files) => setAttachments((prev) => [...prev, ...files])}
        onRemoveAttachment={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
      />
    </div>
  );

  const rightPanelProps = {
    activeTab: rightPanelTab,
    onTabChange: setRightPanelTab,
    owner: repoOwner,
    repoName,
    branch: selectedBranch,
    activeJob,
    jobPreview: {
      previewUrl: previewData?.previewUrl,
      status: previewData?.status,
      lastUpdated: previewData?.lastUpdated,
      loading: previewLoading,
      error: previewError,
    },
    onRefreshJobPreview: () => activeJob && fetchPreview(activeJob.id),
    previewSource,
    onPreviewSourceChange: setPreviewSource,
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-blair-bg text-blair-text">
      {!isMobile && (
        <Sidebar repos={repos} reposLoading={reposLoading} selectedRepo={selectedRepo} onSelectRepo={setSelectedRepo} tier={tier} />
      )}

      {isMobile && (
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="p-0 w-72">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar
              repos={repos}
              reposLoading={reposLoading}
              selectedRepo={selectedRepo}
              onSelectRepo={setSelectedRepo}
              forceExpanded
            />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          repo={selectedRepo}
          branch={selectedBranch}
          activeTab={isMobile ? (mobilePanelOpen ? rightPanelTab : "dashboard") : rightPanelTab}
          onTabChange={handleTopTabChange}
          showMenuButton={isMobile}
          onOpenMenu={() => setMobileMenuOpen(true)}
        />

        {isMobile ? (
          <>
            {chatColumn}
            <Drawer open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
              <DrawerContent className="h-[85vh]">
                <DrawerTitle className="sr-only">Files &amp; Preview</DrawerTitle>
                <RightPanel {...rightPanelProps} />
              </DrawerContent>
            </Drawer>
          </>
        ) : (
          <ResizablePanelGroup direction={tier === "tablet" ? "vertical" : "horizontal"} className="flex-1 min-h-0">
            <ResizablePanel defaultSize={62} minSize={30}>
              {chatColumn}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={38} minSize={22}>
              <RightPanel {...rightPanelProps} />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
