import React, { useState, useEffect, useCallback } from "react";
import { BlairAPI } from "@/api/blair";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Eye, RotateCcw, GitPullRequest } from "lucide-react";
import { format } from "date-fns";
import PreviewPanel from "@/components/dashboard/PreviewPanel";

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

export default function Projects() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [rerunningId, setRerunningId] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const loadJobs = useCallback(async () => {
    try {
      const data = await BlairAPI.listJobs();
      setJobs(data || []);
    } catch (error) {
      console.error("Error loading jobs:", error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 10000);
    return () => clearInterval(interval);
  }, [loadJobs]);

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

  // Opening a prior job is "opening its preview": show the existing live
  // preview UI immediately using whatever the API already has for it,
  // rather than requiring a further click.
  const viewJob = async (job) => {
    setPreviewData(null);
    setPreviewError(null);
    fetchPreview(job.id);
    try {
      const fresh = await BlairAPI.getJob(job.id);
      setSelectedJob(fresh);
    } catch {
      setSelectedJob(job);
    }
  };

  const rerunJob = async (job) => {
    setRerunningId(job.id);
    try {
      await BlairAPI.submitJob({
        repoUrl: job.repo_url,
        baseBranch: job.base_branch,
        prompt: job.prompt,
        provider: job.provider,
      });
      await loadJobs();
    } catch (error) {
      console.error("Error re-running job:", error);
    }
    setRerunningId(null);
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-mono font-bold uppercase tracking-wide text-tfrs-text">
          Job History
        </h1>
        <p className="text-sm text-tfrs-muted mt-1">All jobs submitted to Blair, refreshed every 10s.</p>
      </div>

      <div className="bg-tfrs-surface border border-tfrs-border">
        {isLoading ? (
          <div className="p-12 text-center text-tfrs-muted font-mono text-sm">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-tfrs-muted font-mono text-sm">
            No jobs yet. Submit one from the Dashboard.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-tfrs-border hover:bg-transparent">
                <TableHead className="text-tfrs-muted font-mono uppercase text-xs">Job ID</TableHead>
                <TableHead className="text-tfrs-muted font-mono uppercase text-xs">Repo</TableHead>
                <TableHead className="text-tfrs-muted font-mono uppercase text-xs">Branch</TableHead>
                <TableHead className="text-tfrs-muted font-mono uppercase text-xs">Status</TableHead>
                <TableHead className="text-tfrs-muted font-mono uppercase text-xs">Provider</TableHead>
                <TableHead className="text-tfrs-muted font-mono uppercase text-xs">Created</TableHead>
                <TableHead className="text-tfrs-muted font-mono uppercase text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id} className="border-tfrs-border hover:bg-black/20">
                  <TableCell className="font-mono text-xs text-tfrs-text">
                    {job.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell className="text-tfrs-text text-sm max-w-[200px] truncate">
                    {job.repo_url}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-tfrs-muted">
                    {job.feature_branch || job.base_branch}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-tfrs-red text-tfrs-text border-none rounded-none font-mono text-xs">
                      {STATUS_BADGE[job.status] || job.status?.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-tfrs-muted text-xs font-mono uppercase">
                    {job.provider}
                  </TableCell>
                  <TableCell className="text-tfrs-muted text-xs font-mono">
                    {format(new Date(job.created_at), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => viewJob(job)}
                        aria-label="View job"
                        className="text-tfrs-text hover:bg-black/30"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => rerunJob(job)}
                        disabled={rerunningId === job.id}
                        aria-label="Re-run job"
                        className="text-tfrs-text hover:bg-black/30"
                      >
                        <RotateCcw className={`w-4 h-4 ${rerunningId === job.id ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="bg-tfrs-surface border-tfrs-border text-tfrs-text max-w-2xl max-h-[85vh] overflow-y-auto rounded-none">
          {selectedJob && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-tfrs-gold">{selectedJob.id}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge className="bg-tfrs-red text-tfrs-text border-none rounded-none font-mono">
                    {STATUS_BADGE[selectedJob.status] || selectedJob.status?.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-tfrs-muted font-mono">{selectedJob.repo_url}</span>
                </div>

                <div>
                  <p className="text-xs font-mono uppercase text-tfrs-muted mb-1">Prompt</p>
                  <p className="text-sm text-tfrs-text whitespace-pre-wrap bg-black/30 border border-tfrs-border p-3">
                    {selectedJob.prompt}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-mono uppercase text-tfrs-muted mb-1">Output Log</p>
                  <div className="bg-black/40 border border-tfrs-border p-3 h-64 overflow-y-auto font-mono text-xs whitespace-pre-wrap">
                    {selectedJob.job_logs || "No output yet."}
                  </div>
                </div>

                <PreviewPanel
                  hasJob
                  previewUrl={previewData?.previewUrl}
                  status={previewData?.status}
                  lastUpdated={previewData?.lastUpdated}
                  loading={previewLoading}
                  error={previewError}
                  onRefresh={() => fetchPreview(selectedJob.id)}
                />

                <div className="flex gap-3">
                  {selectedJob.pr_url && (
                    <a href={selectedJob.pr_url} target="_blank" rel="noreferrer" className="flex-1">
                      <Button variant="outline" className="w-full border-tfrs-border text-tfrs-text font-mono uppercase rounded-none">
                        <GitPullRequest className="w-4 h-4 mr-2" />
                        Pull Request
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
