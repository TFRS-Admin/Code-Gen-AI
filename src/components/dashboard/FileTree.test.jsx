import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FileTree from "./FileTree";
import { BlairAPI } from "@/api/blair";

vi.mock("@/api/blair", () => ({
  BlairAPI: { getRepoFiles: vi.fn() },
}));

const REPO_FILES = {
  "package.json": { content: '{"name":"widgets"}', language: "json" },
  "src/main.js": { content: "console.log('hi')", language: "javascript" },
  "src/utils/helpers.js": { content: "export const noop = () => {}", language: "javascript" },
};

afterEach(cleanup);

describe("FileTree", () => {
  it("shows a placeholder when no repo/branch is selected", () => {
    render(<FileTree owner={null} repo={null} branch={null} />);
    expect(screen.getByText(/Select a repository and branch/i)).toBeInTheDocument();
  });

  it("renders the top-level tree with nested directories collapsed by default", async () => {
    BlairAPI.getRepoFiles.mockResolvedValue({ files: REPO_FILES });
    render(<FileTree owner="acme" repo="widgets" branch="main" />);

    expect(await screen.findByText("package.json")).toBeInTheDocument();
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getByText("main.js")).toBeInTheDocument();
    // "utils" is a nested directory one level deeper than the auto-expanded top level.
    expect(screen.queryByText("helpers.js")).not.toBeInTheDocument();
  });

  it("expands a nested folder on click to reveal its contents", async () => {
    const user = userEvent.setup();
    BlairAPI.getRepoFiles.mockResolvedValue({ files: REPO_FILES });
    render(<FileTree owner="acme" repo="widgets" branch="main" />);

    await screen.findByText("utils");
    await user.click(screen.getByText("utils"));

    expect(await screen.findByText("helpers.js")).toBeInTheDocument();

    await user.click(screen.getByText("utils"));
    await waitFor(() => expect(screen.queryByText("helpers.js")).not.toBeInTheDocument());
  });

  it("shows file contents when a file is clicked", async () => {
    const user = userEvent.setup();
    BlairAPI.getRepoFiles.mockResolvedValue({ files: REPO_FILES });
    render(<FileTree owner="acme" repo="widgets" branch="main" />);

    await user.click(await screen.findByText("package.json"));
    const closeButton = await screen.findByRole("button", { name: "Close" });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton.closest("div").parentElement.textContent).toContain('{"name":"widgets"}');
  });

  it("filters files by search term", async () => {
    const user = userEvent.setup();
    BlairAPI.getRepoFiles.mockResolvedValue({ files: REPO_FILES });
    render(<FileTree owner="acme" repo="widgets" branch="main" />);

    await screen.findByText("package.json");
    await user.type(screen.getByPlaceholderText(/filter files/i), "helpers");

    expect(await screen.findByText("src/utils/helpers.js")).toBeInTheDocument();
    expect(screen.queryByText("package.json")).not.toBeInTheDocument();
  });
});
