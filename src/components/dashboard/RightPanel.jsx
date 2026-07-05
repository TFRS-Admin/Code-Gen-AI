import React from "react";
import FileTree from "@/components/dashboard/FileTree";
import WebContainersPreview from "@/components/dashboard/WebContainersPreview";
import PreviewPanel from "@/components/dashboard/PreviewPanel";
import { CheckCircle2, Circle, Loader2, XCircle, Files, MonitorPlay } from "lucide-react";

const STATUS_ORDER = ["queued", "planning", "building", "qa", "preview", "review", "pr_opened", "shipped"];

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

function JobStatusStrip({ job }) {
  if (!job) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-blair-border bg-blair-sidebar overflow-x-auto shrink-0">
      {PHASES.map((phase) => {
        const state = phaseState(job, phase);
        return (
          <div key={phase.label} className="flex items-center gap-1.5 shrink-0">
            {state === "complete" && <CheckCircle2 className="w-3.5 h-3.5 text-blair-primary" />}
            {state === "active" && <Loader2 className="w-3.5 h-3.5 text-blair-primary animate-spin" />}
            {state === "pending" && <Circle className="w-3.5 h-3.5 text-blair-muted" />}
            <span className={`text-[11px] font-medium ${state === "pending" ? "text-blair-muted" : "text-blair-text"}`}>
              {phase.label}
            </span>
          </div>
        );
      })}
      {job.status === "failed" && (
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <XCircle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-[11px] font-medium text-red-500">Failed</span>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: "files", label: "Files", icon: Files },
  { key: "preview", label: "Preview", icon: MonitorPlay },
];

// Right-hand panel of the Blair Dashboard: a Files/Preview tab switcher over
// the repo's file tree (FileTree) and its live preview surfaces. Renders as
// one child of the Dashboard's ResizablePanelGroup, so it always fills the
// height/width react-resizable-panels gives it.
export default function RightPanel({
  activeTab,
  onTabChange,
  owner,
  repoName,
  branch,
  activeJob,
  jobPreview,
  onRefreshJobPreview,
  previewSource,
  onPreviewSourceChange,
}) {
  const hasJobPreview = !!activeJob;

  return (
    <div className="flex flex-col h-full min-h-0 bg-blair-bg">
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-blair-border shrink-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === key
                ? "border-blair-primary text-blair-primary"
                : "border-transparent text-blair-muted hover:text-blair-text"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <JobStatusStrip job={activeJob} />

      <div className="flex-1 min-h-0">
        {activeTab === "files" && <FileTree owner={owner} repo={repoName} branch={branch} />}
        {activeTab === "preview" && (
          <div className="flex flex-col h-full min-h-0 p-2 gap-2">
            {hasJobPreview && (
              <div className="flex border border-blair-border rounded-lg overflow-hidden w-fit shrink-0">
                <button
                  type="button"
                  onClick={() => onPreviewSourceChange("repo")}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    previewSource === "repo" ? "bg-blair-primary text-white" : "text-blair-muted hover:text-blair-text"
                  }`}
                >
                  Live Repo
                </button>
                <button
                  type="button"
                  onClick={() => onPreviewSourceChange("job")}
                  className={`px-3 py-1.5 text-xs font-medium border-l border-blair-border ${
                    previewSource === "job" ? "bg-blair-primary text-white" : "text-blair-muted hover:text-blair-text"
                  }`}
                >
                  Job Build
                </button>
              </div>
            )}
            <div className={`flex-1 min-h-0 ${previewSource === "job" && hasJobPreview ? "" : "hidden"}`}>
              <PreviewPanel
                hasJob={hasJobPreview}
                previewUrl={jobPreview?.previewUrl}
                status={jobPreview?.status}
                lastUpdated={jobPreview?.lastUpdated}
                loading={jobPreview?.loading}
                error={jobPreview?.error}
                onRefresh={onRefreshJobPreview}
              />
            </div>
            <div className={`flex-1 min-h-0 ${previewSource === "job" && hasJobPreview ? "hidden" : ""}`}>
              <WebContainersPreview owner={owner} repo={repoName} branch={branch} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
