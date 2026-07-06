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

// Exposes just the props this suite needs to assert on (which tab is active,
// and what preview data Dashboard computed) — RightPanel's own rendering is
// already covered by RightPanel.test.jsx/PreviewPanel.test.jsx.
vi.mock("@/components/dashboard/RightPanel", () => ({
  default: ({ activeTab, activeJob, jobPreview }) => (
    <div data-testid="right-panel-stub">
      <span data-testid="active-tab">{activeTab}</span>
      <span data-testid="has-active-job">{activeJob ? "yes" : "no"}</span>
      <span data-testid="preview-status">{jobPreview?.status || ""}</span>
      <span data-testid="preview-url">{jobPreview?.previewUrl || ""}</span>
      <span data-testid="preview-loading">{jobPreview?.loading ? "loading" : ""}</span>
    </div>
  ),
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }) => <div>{children}</div>,
  ResizablePanel: ({ children }) => <div>{children}</div>,
  ResizableHandle: () => null,
}));

// Exposes the mobile drawer's `open` state as a data attribute — Vaul's real
// drawer primitive is portal/animation-based and not useful to assert on
// directly; RightPanel (rendered as its children) is already stubbed above.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }) => (
    <div data-testid="mobile-drawer" data-open={open ? "true" : "false"}>
      {children}
    </div>
  ),
  DrawerContent: ({ children }) => <div>{children}</div>,
  DrawerTitle: ({ children }) => <div>{children}</div>,
}));

// On mobile, the repo picker (stubbed Sidebar above) lives inside this Sheet,
// which the real Radix-based component doesn't mount content for while
// closed. Always rendering its children keeps these tests focused on
// preview-drawer behavior rather than the separate hamburger-menu open flow.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }) => <div>{children}</div>,
  SheetContent: ({ children }) => <div>{children}</div>,
  SheetTitle: ({ children }) => <div>{children}</div>,
}));

function setViewportWidth(width) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
}

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

describe("Dashboard: preview opens automatically on app/project selection", () => {
  it("switches to the Preview tab as soon as a repo is selected", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(screen.getByTestId("active-tab")).toHaveTextContent("files");
    await user.click(await screen.findByText(REPO.full_name));

    await waitFor(() => expect(screen.getByTestId("active-tab")).toHaveTextContent("preview"));
  });

  it("loads an existing preview URL immediately when an existing job is restored on load", async () => {
    BlairAPI.listJobs.mockResolvedValue([
      { id: "job-1", status: "shipped", repo_url: "https://github.com/acme/widgets", pr_url: null },
    ]);
    BlairAPI.getPreview.mockResolvedValue({
      previewUrl: "https://preview.example.com/job-1",
      status: "ready",
      lastUpdated: "2026-07-06T00:00:00.000Z",
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("active-tab")).toHaveTextContent("preview"));
    await waitFor(() => expect(screen.getByTestId("preview-url")).toHaveTextContent("https://preview.example.com/job-1"));
    expect(screen.getByTestId("preview-status")).toHaveTextContent("ready");
  });

  it("shows the loading state when the restored job's preview isn't ready yet", async () => {
    BlairAPI.listJobs.mockResolvedValue([
      { id: "job-2", status: "shipped", repo_url: "https://github.com/acme/widgets" },
    ]);
    BlairAPI.getPreview.mockResolvedValue({ previewUrl: null, status: "building", lastUpdated: null });

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("active-tab")).toHaveTextContent("preview"));
    expect(screen.getByTestId("preview-status")).toHaveTextContent("building");
    expect(screen.getByTestId("preview-url")).toHaveTextContent("");
  });

  it("does not crash when the restored job's preview data fails to load", async () => {
    BlairAPI.listJobs.mockResolvedValue([
      { id: "job-3", status: "shipped", repo_url: "https://github.com/acme/widgets" },
    ]);
    BlairAPI.getPreview.mockRejectedValue(new Error("Preview service unavailable"));

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("active-tab")).toHaveTextContent("preview"));
    expect(screen.getByTestId("has-active-job")).toHaveTextContent("yes");
    expect(screen.getByTestId("right-panel-stub")).toBeInTheDocument();
  });

  it("does not crash and stays on the Files tab when there is no repo and no job yet", async () => {
    BlairAPI.listJobs.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByTestId("right-panel-stub")).toBeInTheDocument();
    expect(screen.getByTestId("active-tab")).toHaveTextContent("files");
    expect(screen.getByTestId("has-active-job")).toHaveTextContent("no");
  });
});

describe("Dashboard: mobile preview drawer opens automatically on selection", () => {
  it("opens the mobile drawer (and the Preview tab) as soon as a repo is selected", async () => {
    const user = userEvent.setup();
    setViewportWidth(375);

    renderDashboard();
    expect(screen.getByTestId("mobile-drawer")).toHaveAttribute("data-open", "false");

    await user.click(await screen.findByText(REPO.full_name));

    await waitFor(() => expect(screen.getByTestId("mobile-drawer")).toHaveAttribute("data-open", "true"));
    expect(screen.getByTestId("active-tab")).toHaveTextContent("preview");
  });

  it("opens the mobile drawer (and the Preview tab) when an existing job is restored on load", async () => {
    setViewportWidth(375);
    BlairAPI.listJobs.mockResolvedValue([
      { id: "job-1", status: "shipped", repo_url: "https://github.com/acme/widgets", pr_url: null },
    ]);
    BlairAPI.getPreview.mockResolvedValue({
      previewUrl: "https://preview.example.com/job-1",
      status: "ready",
      lastUpdated: "2026-07-06T00:00:00.000Z",
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("mobile-drawer")).toHaveAttribute("data-open", "true"));
    expect(screen.getByTestId("active-tab")).toHaveTextContent("preview");
  });

  it("does not render a mobile drawer at all on desktop widths (behavior unchanged)", async () => {
    const user = userEvent.setup();
    renderDashboard(); // beforeEach already sets a desktop-width innerWidth

    await user.click(await screen.findByText(REPO.full_name));

    await waitFor(() => expect(screen.getByTestId("active-tab")).toHaveTextContent("preview"));
    expect(screen.queryByTestId("mobile-drawer")).not.toBeInTheDocument();
  });
});
