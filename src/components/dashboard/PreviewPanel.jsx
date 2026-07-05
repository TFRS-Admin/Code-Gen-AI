import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink, AlertTriangle, MonitorPlay } from "lucide-react";

const STATUS_LABEL = {
  building: "BUILDING",
  ready: "LIVE",
  error: "ERROR",
};

const STATUS_DOT = {
  building: "bg-tfrs-gold animate-pulse",
  ready: "bg-tfrs-gold",
  error: "bg-tfrs-red",
};

// Renders the Dashboard's live app preview: an iframe pointed at the job's
// deployed preview branch, with loading/error placeholders driven by the
// GET /api/jobs/:id/preview status ("building" | "ready" | "error").
export default function PreviewPanel({
  hasJob = false,
  previewUrl = null,
  status = null,
  lastUpdated = null,
  loading = false,
  error = null,
  onRefresh,
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const effectiveStatus = status || "building";

  const handleRefresh = () => {
    setReloadKey((key) => key + 1);
    onRefresh?.();
  };

  const handleOpenInNewTab = () => {
    if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="bg-tfrs-surface border border-tfrs-border flex flex-col h-full min-h-[320px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-tfrs-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MonitorPlay className="w-4 h-4 text-tfrs-gold shrink-0" />
          <span className="text-sm font-mono font-bold uppercase tracking-wide text-tfrs-text truncate">
            Live Preview
          </span>
          {hasJob && (
            <span className="flex items-center gap-1.5 text-xs font-mono uppercase text-tfrs-muted ml-2 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[effectiveStatus] || "bg-tfrs-muted"}`} />
              {STATUS_LABEL[effectiveStatus] || effectiveStatus.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={!hasJob}
            aria-label="Refresh preview"
            className="border-tfrs-border text-tfrs-text font-mono uppercase text-xs rounded-none"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenInNewTab}
            disabled={!previewUrl}
            aria-label="Open preview in new tab"
            className="border-tfrs-border text-tfrs-text font-mono uppercase text-xs rounded-none"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative bg-black/40 min-h-0">
        {!hasJob && (
          <div className="absolute inset-0 flex items-center justify-center text-tfrs-muted font-mono text-sm text-center px-6">
            No active job. Submit a job to see the live preview here.
          </div>
        )}

        {hasJob && (loading || effectiveStatus === "building") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-tfrs-muted font-mono text-sm">
            <Loader2 className="w-6 h-6 animate-spin text-tfrs-red" />
            <span>Building preview...</span>
          </div>
        )}

        {hasJob && !loading && effectiveStatus === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-tfrs-red font-mono text-sm text-center px-6">
            <AlertTriangle className="w-6 h-6" />
            <span>{error || "Preview is unavailable for this job."}</span>
          </div>
        )}

        {hasJob && !loading && effectiveStatus === "ready" && previewUrl && (
          <iframe
            key={reloadKey}
            src={previewUrl}
            title="Live app preview"
            className="w-full h-full border-0 bg-white"
          />
        )}
      </div>

      {hasJob && lastUpdated && (
        <div className="px-4 py-2 border-t border-tfrs-border text-[10px] font-mono text-tfrs-muted uppercase shrink-0">
          Updated {new Date(lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
