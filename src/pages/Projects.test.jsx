import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Projects from "./Projects";
import { BlairAPI } from "@/api/blair";

vi.mock("@/api/blair", () => ({
  BlairAPI: {
    listJobs: vi.fn(),
    getJob: vi.fn(),
    getPreview: vi.fn(),
    submitJob: vi.fn(),
  },
}));

afterEach(cleanup);

const JOB = {
  id: "job-1234567890",
  repo_url: "https://github.com/acme/widgets",
  base_branch: "main",
  feature_branch: "feature/blair-job-1",
  status: "shipped",
  provider: "mock",
  prompt: "Add a dark mode toggle",
  job_logs: "done",
  pr_url: "https://github.com/acme/widgets/pull/1",
  created_at: "2026-07-06T00:00:00.000Z",
};

async function openJobDialog(user) {
  render(<Projects />);
  await user.click(await screen.findByLabelText("View job"));
}

describe("Projects: opening a prior job shows its live preview immediately", () => {
  it("fetches and shows the live preview as soon as a job is opened", async () => {
    const user = userEvent.setup();
    BlairAPI.listJobs.mockResolvedValue([JOB]);
    BlairAPI.getJob.mockResolvedValue(JOB);
    BlairAPI.getPreview.mockResolvedValue({
      previewUrl: "https://preview.example.com/job-1",
      status: "ready",
      lastUpdated: "2026-07-06T00:05:00.000Z",
    });

    await openJobDialog(user);

    await waitFor(() => expect(BlairAPI.getPreview).toHaveBeenCalledWith(JOB.id));
    expect(await screen.findByText("Live Preview")).toBeInTheDocument();
  });

  it("uses the existing preview URL and renders it immediately when the preview is already ready", async () => {
    const user = userEvent.setup();
    BlairAPI.listJobs.mockResolvedValue([JOB]);
    BlairAPI.getJob.mockResolvedValue(JOB);
    BlairAPI.getPreview.mockResolvedValue({
      previewUrl: "https://preview.example.com/job-1",
      status: "ready",
      lastUpdated: "2026-07-06T00:05:00.000Z",
    });

    await openJobDialog(user);

    const iframe = await screen.findByTitle("Live app preview");
    expect(iframe).toHaveAttribute("src", "https://preview.example.com/job-1");
  });

  it("shows the existing building/loading UI when the preview isn't ready yet", async () => {
    const user = userEvent.setup();
    BlairAPI.listJobs.mockResolvedValue([JOB]);
    BlairAPI.getJob.mockResolvedValue(JOB);
    BlairAPI.getPreview.mockResolvedValue({ previewUrl: null, status: "building", lastUpdated: null });

    await openJobDialog(user);

    expect(await screen.findByText(/Building preview/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Live app preview")).not.toBeInTheDocument();
  });

  it("shows the existing error UI when the preview failed, without crashing", async () => {
    const user = userEvent.setup();
    BlairAPI.listJobs.mockResolvedValue([JOB]);
    BlairAPI.getJob.mockResolvedValue(JOB);
    BlairAPI.getPreview.mockResolvedValue({ previewUrl: null, status: "error", lastUpdated: null });

    await openJobDialog(user);

    expect(await screen.findByText(/Preview is unavailable for this job/i)).toBeInTheDocument();
  });

  it("does not crash when the preview request itself fails", async () => {
    const user = userEvent.setup();
    BlairAPI.listJobs.mockResolvedValue([JOB]);
    BlairAPI.getJob.mockResolvedValue(JOB);
    BlairAPI.getPreview.mockRejectedValue(new Error("Preview service unavailable"));

    await openJobDialog(user);

    // No status comes back from a failed request, so PreviewPanel falls back
    // to its "building" state — the same graceful fallback Dashboard.jsx
    // already relies on. The point of this test is that nothing throws.
    expect(await screen.findByText("Live Preview")).toBeInTheDocument();
    expect(screen.queryByTitle("Live app preview")).not.toBeInTheDocument();
  });

  it("does not crash when the job has no preview data at all", async () => {
    const user = userEvent.setup();
    const jobWithoutPreview = { ...JOB, pr_url: null };
    BlairAPI.listJobs.mockResolvedValue([jobWithoutPreview]);
    BlairAPI.getJob.mockResolvedValue(jobWithoutPreview);
    BlairAPI.getPreview.mockResolvedValue({ previewUrl: null, status: null, lastUpdated: null });

    await openJobDialog(user);

    expect(await screen.findByText("Live Preview")).toBeInTheDocument();
    expect(screen.queryByTitle("Live app preview")).not.toBeInTheDocument();
  });
});
