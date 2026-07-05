import React from "react";
import FileTree from "@/components/dashboard/FileTree";
import WebContainersPreview from "@/components/dashboard/WebContainersPreview";
import PreviewPanel from "@/components/dashboard/PreviewPanel";
import PhaseStrip from "@/components/dashboard/PhaseStrip";
import { Files, MonitorPlay } from "lucide-react";

function JobStatusStrip({ job }) {
  if (!job) return null;
  return (
    <div className="px-3 py-2 border-b border-blair-border bg-blair-sidebar overflow-x-auto shrink-0">
      <PhaseStrip job={job} />
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
