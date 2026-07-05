import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PhaseStrip from "./PhaseStrip";

afterEach(cleanup);

describe("PhaseStrip", () => {
  it("renders all six lifecycle phases", () => {
    render(<PhaseStrip job={{ status: "building" }} />);
    ["Define", "Plan", "Build", "Verify", "Review", "Ship"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("does not show a Failed badge for an in-progress job", () => {
    render(<PhaseStrip job={{ status: "building" }} />);
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });

  it("shows a Failed badge once the job has failed", () => {
    render(<PhaseStrip job={{ status: "failed" }} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders every phase pending when there is no job yet", () => {
    render(<PhaseStrip job={null} />);
    expect(screen.getByText("Define")).toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });
});
