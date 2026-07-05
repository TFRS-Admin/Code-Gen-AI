import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";
import { BlairAPI } from "@/api/blair";
import { useToast } from "@/components/ui/use-toast";

vi.mock("@/api/blair", () => ({
  BlairAPI: {
    listRepos: vi.fn(),
    listBranches: vi.fn(),
    listJobs: vi.fn(),
    submitJob: vi.fn(),
    getJob: vi.fn(),
    getPreview: vi.fn(),
  },
}));

vi.mock("@/components/ui/use-toast", () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

// Sidebar and RightPanel pull in localStorage-driven search UI and heavy
// file/preview fetching that's already covered by their own test files;
// stubbing them keeps this suite focused on the job-submission wiring.
vi.mock("@/components/dashboard/Sidebar", () => ({
  default: ({ repos, onSelectRepo }) => (
    <div>
      {repos.map((repo) => (
        <button key={repo.full_name} onClick={() => onSelectRepo(repo)}>
          {repo.full_name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/dashboard/RightPanel", () => ({
  default: () => <div data-testid="right-panel-stub" />,
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }) => <div>{children}</div>,
  ResizablePanel: ({ children }) => <div>{children}</div>,
  ResizableHandle: () => null,
}));

const REPO = { full_name: "acme/widgets", private: false, default_branch: "main" };

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/Dashboard"]}>
      <Dashboard />
    </MemoryRouter>
  );
}

async function selectRepoAndTypePrompt(user, text) {
  renderDashboard();
  await user.click(await screen.findByText(REPO.full_name));

  const textarea = await screen.findByPlaceholderText(/describe what you want to build/i);
  await waitFor(() => expect(textarea).not.toBeDisabled());
  await user.type(textarea, text);
  return textarea;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  BlairAPI.listRepos.mockResolvedValue([REPO]);
  BlairAPI.listBranches.mockResolvedValue([{ name: "main" }, { name: "develop" }]);
  BlairAPI.listJobs.mockResolvedValue([]);
  BlairAPI.getPreview.mockResolvedValue({ previewUrl: null, status: "building", lastUpdated: null });
});

afterEach(cleanup);

describe("Dashboard job submission", () => {
  it("submits a job with the selected repo, branch, and prompt, and clears the input", async () => {
    const user = userEvent.setup();
    BlairAPI.submitJob.mockResolvedValue({ id: "job-1" });
    BlairAPI.getJob.mockResolvedValue({ id: "job-1", status: "planning" });

    const textarea = await selectRepoAndTypePrompt(user, "Add a dark mode toggle to the header");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(BlairAPI.submitJob).toHaveBeenCalledWith(
        expect.objectContaining({
          repoUrl: "https://github.com/acme/widgets",
          baseBranch: "main",
          prompt: "Add a dark mode toggle to the header",
        })
      )
    );
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("shows a 'Job submitted' system message and the job's phase progress in chat", async () => {
    const user = userEvent.setup();
    BlairAPI.submitJob.mockResolvedValue({ id: "job-1" });
    BlairAPI.getJob.mockResolvedValue({ id: "job-1", status: "planning" });

    await selectRepoAndTypePrompt(user, "Add a dark mode toggle to the header");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Job submitted: acme/widgets / main")).toBeInTheDocument();
    expect(await screen.findByText("Plan")).toBeInTheDocument();
    expect(await screen.findByText("Ship")).toBeInTheDocument();
  });

  it("shows a loading state on the Send button while the job is being submitted", async () => {
    const user = userEvent.setup();
    let resolveSubmit;
    BlairAPI.submitJob.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      })
    );
    BlairAPI.getJob.mockResolvedValue({ id: "job-1", status: "planning" });

    await selectRepoAndTypePrompt(user, "Add a dark mode toggle to the header");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText(/sending/i)).toBeInTheDocument();

    resolveSubmit({ id: "job-1" });
    await waitFor(() => expect(screen.queryByText(/sending/i)).not.toBeInTheDocument());
  });

  it("displays the PR link once the job reaches a terminal status", async () => {
    const user = userEvent.setup();
    BlairAPI.submitJob.mockResolvedValue({ id: "job-1" });
    BlairAPI.getJob
      .mockResolvedValueOnce({ id: "job-1", status: "planning" })
      .mockResolvedValue({ id: "job-1", status: "shipped", pr_url: "https://github.com/acme/widgets/pull/7" });

    await selectRepoAndTypePrompt(user, "Add a dark mode toggle to the header");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const link = await screen.findByRole("link", { name: /view pull request/i }, { timeout: 4000 });
    expect(link).toHaveAttribute("href", "https://github.com/acme/widgets/pull/7");
  });

  it("shows an error toast and an inline error when job submission fails", async () => {
    const user = userEvent.setup();
    BlairAPI.submitJob.mockRejectedValue(new Error("Server unavailable"));

    await selectRepoAndTypePrompt(user, "Add a dark mode toggle to the header");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const { toast: mockToast } = useToast();
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Job submission failed", description: "Server unavailable", variant: "destructive" })
      )
    );
    expect(await screen.findByText(/couldn't start that job: Server unavailable/i)).toBeInTheDocument();
  });

  it("requires a repo and branch to be selected before sending", async () => {
    renderDashboard();
    expect(await screen.findByPlaceholderText(/select a repository to get started/i)).toBeDisabled();
  });
});
