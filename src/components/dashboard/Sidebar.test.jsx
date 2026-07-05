import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "./Sidebar";

const REPOS = [
  { full_name: "acme/widgets", private: false, default_branch: "main" },
  { full_name: "acme/gadgets", private: true, default_branch: "main" },
];

function renderSidebar(props = {}) {
  return render(
    <MemoryRouter>
      <Sidebar repos={REPOS} reposLoading={false} selectedRepo={null} onSelectRepo={() => {}} {...props} />
    </MemoryRouter>
  );
}

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
});

describe("Sidebar", () => {
  it("renders expanded at 280px by default with nav labels visible", () => {
    renderSidebar();
    expect(screen.getByTestId("blair-sidebar")).toHaveStyle({ width: "280px" });
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Job History")).toBeInTheDocument();
  });

  it("collapses to 60px and hides labels when the collapse button is clicked", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /collapse sidebar/i }));

    expect(screen.getByTestId("blair-sidebar")).toHaveStyle({ width: "60px" });
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("expands back to its previous width when the expand button is clicked", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    await user.click(screen.getByRole("button", { name: /expand sidebar/i }));

    expect(screen.getByTestId("blair-sidebar")).toHaveStyle({ width: "280px" });
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("shows recent repos and lets the user reselect one", async () => {
    const user = userEvent.setup();
    const onSelectRepo = vi.fn();
    renderSidebar({ selectedRepo: REPOS[0], onSelectRepo });

    expect(await screen.findByText("Recents")).toBeInTheDocument();
    const recentsSection = screen.getByText("Recents").closest("div").parentElement;
    await user.click(within(recentsSection).getByText("acme/widgets"));
    expect(onSelectRepo).toHaveBeenCalledWith(expect.objectContaining(REPOS[0]));
  });
});
