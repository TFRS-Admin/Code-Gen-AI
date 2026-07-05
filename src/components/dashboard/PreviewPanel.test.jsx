import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PreviewPanel from "./PreviewPanel";

afterEach(cleanup);

describe("PreviewPanel", () => {
  it("renders without errors when there is no active job", () => {
    render(<PreviewPanel hasJob={false} />);
    expect(screen.getByText("Live Preview")).toBeInTheDocument();
    expect(screen.getByText(/No active job/i)).toBeInTheDocument();
  });

  it("shows a loading spinner while the preview is building", () => {
    render(<PreviewPanel hasJob status="building" />);
    expect(screen.getByText(/Building preview/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Live app preview")).not.toBeInTheDocument();
  });

  it("shows an error message when the preview status is error", () => {
    render(<PreviewPanel hasJob status="error" error="Build failed" />);
    expect(screen.getByText("Build failed")).toBeInTheDocument();
  });

  it("renders the iframe with the preview URL once the preview is ready", () => {
    render(<PreviewPanel hasJob status="ready" previewUrl="https://preview.example.com/job-1" />);
    const iframe = screen.getByTitle("Live app preview");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "https://preview.example.com/job-1");
  });

  it("updates the iframe's preview URL when the job status changes from building to ready", () => {
    const { rerender } = render(<PreviewPanel hasJob status="building" />);
    expect(screen.queryByTitle("Live app preview")).not.toBeInTheDocument();

    rerender(<PreviewPanel hasJob status="ready" previewUrl="https://preview.example.com/job-2" />);

    const iframe = screen.getByTitle("Live app preview");
    expect(iframe).toHaveAttribute("src", "https://preview.example.com/job-2");
  });

  it("calls onRefresh when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <PreviewPanel hasJob status="ready" previewUrl="https://preview.example.com/job-1" onRefresh={onRefresh} />
    );

    await user.click(screen.getByRole("button", { name: /refresh preview/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("opens the preview URL in a new tab when 'Open in new tab' is clicked", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    render(<PreviewPanel hasJob status="ready" previewUrl="https://preview.example.com/job-1" />);

    await user.click(screen.getByRole("button", { name: /open preview in new tab/i }));

    expect(openSpy).toHaveBeenCalledWith("https://preview.example.com/job-1", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("disables the open-in-new-tab button when there is no preview URL yet", () => {
    render(<PreviewPanel hasJob status="building" />);
    expect(screen.getByRole("button", { name: /open preview in new tab/i })).toBeDisabled();
  });
});
