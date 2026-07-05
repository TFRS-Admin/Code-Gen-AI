import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RightPanel from "./RightPanel";

vi.mock("./FileTree", () => ({
  default: () => <div>FileTree contents</div>,
}));
vi.mock("./WebContainersPreview", () => ({
  default: () => <div>WebContainers preview</div>,
}));
vi.mock("./PreviewPanel", () => ({
  default: () => <div>Job preview</div>,
}));

afterEach(cleanup);

function renderPanel(props = {}) {
  const onTabChange = vi.fn();
  const utils = render(
    <RightPanel
      activeTab="files"
      onTabChange={onTabChange}
      owner="acme"
      repoName="widgets"
      branch="main"
      activeJob={null}
      jobPreview={{}}
      onRefreshJobPreview={() => {}}
      previewSource="repo"
      onPreviewSourceChange={() => {}}
      {...props}
    />
  );
  return { ...utils, onTabChange };
}

describe("RightPanel", () => {
  it("shows the Files tab content by default", () => {
    renderPanel();
    expect(screen.getByText("FileTree contents")).toBeInTheDocument();
  });

  it("shows the Preview tab content, including the instant repo preview, when selected", () => {
    renderPanel({ activeTab: "preview" });
    expect(screen.getByText("WebContainers preview")).toBeInTheDocument();
  });

  it("calls onTabChange when a tab is clicked", async () => {
    const user = userEvent.setup();
    const { onTabChange } = renderPanel();

    await user.click(screen.getByRole("button", { name: /preview/i }));
    expect(onTabChange).toHaveBeenCalledWith("preview");
  });

  it("shows the job status timeline once there is an active job", () => {
    renderPanel({ activeJob: { status: "building" } });
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Ship")).toBeInTheDocument();
  });
});
