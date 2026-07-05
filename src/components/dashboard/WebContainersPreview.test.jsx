import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import WebContainersPreview from "./WebContainersPreview";
import { BlairAPI } from "@/api/blair";
import { WebContainer } from "@webcontainer/api";

vi.mock("@/api/blair", () => ({
  BlairAPI: { getRepoFiles: vi.fn() },
}));

vi.mock("@webcontainer/api", () => ({
  WebContainer: { boot: vi.fn() },
}));

const REPO_FILES = {
  "package.json": { content: JSON.stringify({ name: "widgets", scripts: { dev: "vite" } }), language: "json" },
  "src/main.js": { content: "console.log('hi')", language: "javascript" },
};

function makeProcess(exitCode = 0) {
  return {
    output: { pipeTo: vi.fn().mockResolvedValue(undefined) },
    exit: Promise.resolve(exitCode),
    kill: vi.fn(),
  };
}

function makeInstance() {
  const handlers = {};
  return {
    handlers,
    on: vi.fn((event, cb) => {
      handlers[event] = cb;
    }),
    mount: vi.fn().mockResolvedValue(undefined),
    spawn: vi.fn().mockResolvedValue(makeProcess(0)),
    teardown: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.crossOriginIsolated = true;
});

describe("WebContainersPreview", () => {
  it("shows a placeholder when no repo/branch is selected", () => {
    render(<WebContainersPreview owner={null} repo={null} branch={null} />);
    expect(screen.getByText(/Select a repository and branch/i)).toBeInTheDocument();
  });

  it("shows a clear error when the page isn't cross-origin isolated", async () => {
    window.crossOriginIsolated = false;
    render(<WebContainersPreview owner="acme" repo="widgets" branch="main" />);
    await waitFor(() => expect(screen.getByText(/cross-origin isolated/i)).toBeInTheDocument());
    expect(BlairAPI.getRepoFiles).not.toHaveBeenCalled();
  });

  it("walks through fetching -> booting -> installing -> starting -> ready and renders the iframe on server-ready", async () => {
    BlairAPI.getRepoFiles.mockResolvedValue({ files: REPO_FILES });
    const instance = makeInstance();
    WebContainer.boot.mockResolvedValue(instance);

    render(<WebContainersPreview owner="acme" repo="widgets" branch="main" />);

    await waitFor(() => expect(instance.mount).toHaveBeenCalled());
    expect(instance.mount).toHaveBeenCalledWith(
      expect.objectContaining({
        "package.json": { file: { contents: REPO_FILES["package.json"].content } },
        src: { directory: { "main.js": { file: { contents: REPO_FILES["src/main.js"].content } } } },
      })
    );

    await waitFor(() => expect(instance.spawn).toHaveBeenCalledWith("npm", ["install"]));
    await waitFor(() => expect(instance.spawn).toHaveBeenCalledWith("npm", ["run", "dev"]));

    act(() => {
      instance.handlers["server-ready"](3000, "https://preview.example.com/abc");
    });

    const iframe = await screen.findByTitle("WebContainers live repo preview");
    expect(iframe).toHaveAttribute("src", "https://preview.example.com/abc");
  });

  it("shows an error state when npm install fails", async () => {
    BlairAPI.getRepoFiles.mockResolvedValue({ files: REPO_FILES });
    const instance = makeInstance();
    instance.spawn.mockResolvedValueOnce(makeProcess(1));
    WebContainer.boot.mockResolvedValue(instance);

    render(<WebContainersPreview owner="acme" repo="widgets" branch="main" />);

    await waitFor(() => expect(screen.getByText(/npm install failed/i)).toBeInTheDocument());
  });

  it("shows an error state when the repo has no package.json", async () => {
    BlairAPI.getRepoFiles.mockResolvedValue({ files: { "README.md": { content: "hi", language: "markdown" } } });
    WebContainer.boot.mockResolvedValue(makeInstance());

    render(<WebContainersPreview owner="acme" repo="widgets" branch="main" />);

    await waitFor(() => expect(screen.getByText(/No package\.json found/i)).toBeInTheDocument());
  });

  it("shows an error state when the GitHub file fetch fails", async () => {
    BlairAPI.getRepoFiles.mockRejectedValue(new Error("GITHUB_TOKEN is not set"));

    render(<WebContainersPreview owner="acme" repo="widgets" branch="main" />);

    await waitFor(() => expect(screen.getByText(/GITHUB_TOKEN is not set/i)).toBeInTheDocument());
  });
});
